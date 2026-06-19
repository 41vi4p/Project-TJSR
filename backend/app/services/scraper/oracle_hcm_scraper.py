"""
Oracle Cloud HCM Candidate Experience (CE) scraper.

Many large enterprises (JPMC, etc.) host their career sites on Oracle HCM.
The SPA at  /hcmUI/CandidateExperience/en/sites/{site}/jobs  fetches data
from a public REST endpoint that we can call directly — no Selenium/JS needed.

API:  https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions
"""

import logging
import re
import time
from urllib.parse import urlparse, parse_qs

import requests
from bs4 import BeautifulSoup

from app.services.scraper.base import BaseScraper, RawContent

logger = logging.getLogger(__name__)

_PAGE_SIZE = 25   # Oracle HCM default
_MAX_PAGES = 200  # safety cap (~5 000 jobs)

# Fields to request in the listing call
_LIST_FIELDS = (
    "requisitionId,displayJobTitle,externalStatus,primaryLocation,"
    "primaryLocationCountry,locations,workLocation,jobSchedule,jobType,"
    "hotJob,publishedDate,updateDate,shortDescription,content"
)


class OracleHCMScraper(BaseScraper):
    """
    Scraper for Oracle Cloud HCM Candidate Experience career portals.
    Hits the internal REST API directly — no JS rendering required.
    """

    name = "oracle_hcm"

    def can_handle(self, url: str) -> bool:
        return "fa.oraclecloud.com" in url or "/hcmUI/CandidateExperience" in url

    def scrape(self, url: str, config: dict | None = None) -> list[RawContent]:
        config = config or {}
        self._log(f"Oracle HCM scraper starting: {url}")

        params = self._parse_listing_url(url)
        if not params:
            self._log("Could not parse Oracle HCM URL", "error")
            return []

        host        = params["host"]
        site_number = params["site_number"]
        api_base    = f"https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions"

        session = self._build_session()
        all_jobs: list[RawContent] = []
        offset = 0
        max_pages = config.get("max_pages", _MAX_PAGES)

        for page in range(max_pages):
            finder = self._build_finder(site_number, params)
            api_params = {
                "finder":   finder,
                "fields":   _LIST_FIELDS,
                "expand":   "content",
                "onlyData": "true",
                "limit":    str(_PAGE_SIZE),
                "offset":   str(offset),
            }

            try:
                resp = session.get(api_base, params=api_params, timeout=30)
                resp.raise_for_status()
                data = resp.json()
            except Exception as exc:
                self._log(f"API call failed at offset {offset}: {exc}", "error")
                break

            items = data.get("items", [])
            if not items:
                self._log(f"No more items at offset {offset} — done")
                break

            self._log(f"Page {page + 1}: fetched {len(items)} jobs (offset {offset})")

            for item in items:
                rc = self._item_to_raw_content(item, host, site_number)
                if rc:
                    all_jobs.append(rc)

            # Oracle returns hasMore or a next link when there are more pages
            has_more = data.get("hasMore", False)
            links    = {lnk.get("rel"): lnk.get("href") for lnk in data.get("links", [])}
            if not has_more and "next" not in links:
                break

            offset += _PAGE_SIZE
            time.sleep(0.5)  # polite pacing

        self._log(f"Oracle HCM complete: {len(all_jobs)} jobs collected")
        return all_jobs

    # ── URL parsing ───────────────────────────────────────────────────────────

    def _parse_listing_url(self, url: str) -> dict | None:
        """
        Extract host, site number, and filter parameters from the CE listing URL.

        Example:
          https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/jobs
            ?locationId=300000000289360&locationLevel=country&mode=location
            &selectedCategoriesFacet=300000086152753
        """
        try:
            parsed  = urlparse(url)
            host    = parsed.netloc  # e.g. jpmc.fa.oraclecloud.com
            qs      = parse_qs(parsed.query, keep_blank_values=False)

            # Extract site number from path: .../sites/CX_1001/jobs
            site_match  = re.search(r"/sites/([^/]+)/", parsed.path)
            site_number = site_match.group(1) if site_match else "CX_1001"

            return {
                "host":        host,
                "site_number": site_number,
                # Filter params — all optional
                "location_id":          qs.get("locationId",                [""])[0],
                "location_level":       qs.get("locationLevel",             ["country"])[0],
                "mode":                 qs.get("mode",                      ["location"])[0],
                "categories_facet":     qs.get("selectedCategoriesFacet",   [""])[0],
                "keyword":              qs.get("keyword",                   [""])[0],
            }
        except Exception as exc:
            self._log(f"URL parse error: {exc}", "error")
            return None

    def _build_finder(self, site_number: str, params: dict) -> str:
        """
        Build the Oracle HCM finder string.
        Format: findReqs;siteNumber=X,key=val,...
        """
        parts = [f"siteNumber={site_number}"]

        if params.get("location_id"):
            parts.append(f"locationId={params['location_id']}")
        if params.get("location_level"):
            parts.append(f"locationLevel={params['location_level']}")
        if params.get("mode"):
            parts.append(f"mode={params['mode']}")
        if params.get("categories_facet"):
            parts.append(f"selectedCategoriesFacet={params['categories_facet']}")
        if params.get("keyword"):
            parts.append(f"keyword={params['keyword']}")

        return "findReqs;" + ",".join(parts)

    # ── Response mapping ──────────────────────────────────────────────────────

    def _item_to_raw_content(self, item: dict, host: str, site_number: str) -> RawContent | None:
        """Convert one Oracle HCM API item to a RawContent with json_ld_jobs metadata."""
        req_id = item.get("requisitionId") or item.get("Id")
        if not req_id:
            return None

        title = item.get("displayJobTitle") or item.get("Title") or ""
        if not title:
            return None

        # Apply / canonical URL for this job
        apply_link = (
            f"https://{host}/hcmUI/CandidateExperience/en/sites/{site_number}"
            f"/job/{req_id}"
        )

        # Location
        location = self._extract_location(item)

        # Description: prefer structured content, fall back to shortDescription
        description_html = self._extract_description(item)
        description_text = self._html_to_text(description_html) if description_html else (
            item.get("shortDescription") or ""
        )

        # Job type / schedule
        job_type    = self._map_job_type(item.get("jobSchedule") or item.get("jobType") or "")
        date_posted = (item.get("publishedDate") or item.get("updateDate") or "")[:10]  # YYYY-MM-DD

        # Build a JSON-LD-like dict so the NLP extractor can reuse _job_from_json_ld
        json_ld = {
            "@type":            "JobPosting",
            "title":            title,
            "url":              apply_link,
            "hiringOrganization": {"@type": "Organization", "name": "JPMorganChase"},
            "jobLocation":      self._location_to_jsonld(location),
            "employmentType":   self._job_type_to_schema(job_type),
            "description":      description_html or description_text,
            "datePosted":       date_posted,
        }

        # Plain text for NLP fallback
        plain_text = (
            f"{title}\n"
            f"Company: JPMorganChase\n"
            f"Location: {location}\n"
            f"Type: {job_type}\n"
            f"Posted: {date_posted}\n\n"
            f"{description_text}"
        )

        return RawContent(
            url=apply_link,
            html=description_html or "",
            text=plain_text[:10_000],
            title=title,
            engine=self.name,
            metadata={"json_ld_jobs": [json_ld]},
        )

    def _extract_location(self, item: dict) -> str:
        """Build a human-readable location string from the API response."""
        # Try structured locations array first
        locations = item.get("locations") or []
        if isinstance(locations, list) and locations:
            parts = []
            for loc in locations[:3]:
                if isinstance(loc, dict):
                    city    = loc.get("city")    or loc.get("name") or ""
                    country = loc.get("country") or loc.get("countryName") or ""
                    if city and country:
                        parts.append(f"{city}, {country}")
                    elif city:
                        parts.append(city)
                    elif country:
                        parts.append(country)
            if parts:
                return " | ".join(parts)

        # Fall back to primaryLocation string
        primary = item.get("primaryLocation") or ""
        if primary:
            return primary

        country = item.get("primaryLocationCountry") or ""
        return country

    def _extract_description(self, item: dict) -> str:
        """Extract full HTML description from the Oracle content expand."""
        # When expand=content the API nests a 'content' object
        content = item.get("content")
        if isinstance(content, dict):
            # Oracle may use any of these keys for the body
            for key in ("jobDescription", "description", "body", "externalDescriptionStr"):
                val = content.get(key)
                if val and isinstance(val, str) and len(val) > 50:
                    return val
            # Sometimes it's nested further
            desc = content.get("jobDescription") or {}
            if isinstance(desc, dict):
                return desc.get("content") or desc.get("value") or ""

        # Flat field fallback
        for key in ("jobDescription", "description", "shortDescription"):
            val = item.get(key)
            if val and isinstance(val, str) and len(val) > 50:
                return val

        return ""

    def _html_to_text(self, html: str) -> str:
        """Strip HTML tags to plain text for the NLP extractor."""
        try:
            soup = BeautifulSoup(html, "lxml")
            return soup.get_text(separator="\n", strip=True)[:8_000]
        except Exception:
            return re.sub(r"<[^>]+>", " ", html).strip()[:8_000]

    # ── Type mapping helpers ──────────────────────────────────────────────────

    @staticmethod
    def _map_job_type(raw: str) -> str:
        raw_l = raw.lower()
        if "part" in raw_l:
            return "Part-time"
        if "intern" in raw_l:
            return "Internship"
        if "contract" in raw_l or "temp" in raw_l:
            return "Contract"
        return "Full-time"

    @staticmethod
    def _job_type_to_schema(job_type: str) -> str:
        mapping = {
            "Full-time":  "FULL_TIME",
            "Part-time":  "PART_TIME",
            "Contract":   "CONTRACTOR",
            "Internship": "INTERN",
        }
        return mapping.get(job_type, "FULL_TIME")

    @staticmethod
    def _location_to_jsonld(location: str) -> list[dict]:
        """Convert 'City, Country' string to schema.org jobLocation list."""
        if not location:
            return []
        parts = [p.strip() for p in location.split(",")]
        addr: dict = {}
        if len(parts) >= 2:
            addr["addressLocality"] = parts[0]
            addr["addressCountry"]  = parts[-1]
        else:
            addr["addressLocality"] = parts[0]
        return [{"@type": "Place", "address": addr}]

    # ── Session ───────────────────────────────────────────────────────────────

    @staticmethod
    def _build_session() -> requests.Session:
        s = requests.Session()
        s.headers.update({
            "User-Agent":      (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept":          "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer":         "https://jpmc.fa.oraclecloud.com/",
        })
        return s
