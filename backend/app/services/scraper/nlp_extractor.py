"""NLP extraction layer: converts raw scraped content into structured job data."""

import re
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ISO 3166-1 alpha-2 → full country name (common job-posting countries)
_COUNTRY_CODES: dict[str, str] = {
    "IN": "India", "US": "United States", "GB": "United Kingdom",
    "CA": "Canada", "AU": "Australia", "DE": "Germany", "FR": "France",
    "NL": "Netherlands", "SG": "Singapore", "JP": "Japan", "CN": "China",
    "BR": "Brazil", "MX": "Mexico", "IE": "Ireland", "SE": "Sweden",
    "CH": "Switzerland", "AE": "UAE", "SA": "Saudi Arabia", "IL": "Israel",
    "PL": "Poland", "ES": "Spain", "IT": "Italy", "HK": "Hong Kong",
    "MY": "Malaysia", "PH": "Philippines", "ID": "Indonesia", "NZ": "New Zealand",
}

# Name → ISO codes (for filter aliasing in the API)
LOCATION_ALIASES: dict[str, list[str]] = {
    name.lower(): [code, name] for code, name in _COUNTRY_CODES.items()
}


def _expand_country_code(raw: str) -> str:
    """Convert an ISO 3166-1 alpha-2 code like 'IN' to 'India'. Pass-through if not a known code."""
    return _COUNTRY_CODES.get(raw.strip().upper(), raw)


# Common skills for matching
TECH_SKILLS = {
    "python", "java", "javascript", "typescript", "c++", "c#", "go", "rust",
    "ruby", "php", "swift", "kotlin", "scala", "r", "matlab",
    "react", "angular", "vue", "svelte", "next.js", "nuxt", "django", "flask",
    "fastapi", "spring", "express", "nest.js", "rails", "laravel",
    "node.js", "deno", "bun",
    "html", "css", "tailwind", "bootstrap", "sass", "less",
    "sql", "nosql", "postgresql", "mysql", "mongodb", "redis", "elasticsearch",
    "dynamodb", "cassandra", "sqlite",
    "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ansible",
    "jenkins", "github actions", "gitlab ci", "circleci",
    "git", "linux", "bash", "nginx", "apache",
    "machine learning", "deep learning", "nlp", "computer vision",
    "tensorflow", "pytorch", "scikit-learn", "pandas", "numpy",
    "hadoop", "spark", "kafka", "airflow",
    "graphql", "rest", "grpc", "websocket",
    "figma", "sketch", "adobe xd",
    "agile", "scrum", "jira", "confluence",
}

JOB_TYPE_PATTERNS = {
    "Full-time": r"\b(full[\s-]?time|permanent|fte)\b",
    "Part-time": r"\b(part[\s-]?time)\b",
    "Contract": r"\b(contract|freelance|consulting)\b",
    "Internship": r"\b(intern(?:ship)?|co[\s-]?op|trainee)\b",
}

SALARY_PATTERN = re.compile(
    r"(?:\$|€|£|₹|USD|EUR|GBP|INR)\s*[\d,.]+(?:\s*[-–]\s*(?:\$|€|£|₹|USD|EUR|GBP|INR)?\s*[\d,.]+)?"
    r"(?:\s*(?:/\s*(?:year|yr|month|mo|hour|hr|annum|annual))?)",
    re.IGNORECASE,
)

LOCATION_PATTERNS = [
    r"\b(remote)\b",
    r"\b(hybrid)\b",
    r"\b(on[\s-]?site|in[\s-]?office)\b",
    r"(?:location|based in|office in|located in)[:\s]+([^,\n]{3,50})",
]


@dataclass
class ExtractedJob:
    title: str = ""
    company: str = ""
    location: str = ""
    description: str = ""
    skills: list[str] = field(default_factory=list)
    job_type: str = ""
    salary: str = ""
    apply_link: str = ""
    date_posted: str = ""  # ISO 8601 string from JSON-LD datePosted


def extract_jobs_from_content(text: str, url: str = "", html: str = "", metadata: dict | None = None) -> list[ExtractedJob]:
    """Extract structured job data from raw text content."""
    metadata = metadata or {}

    # ── Priority 1: JSON-LD structured data (most accurate, no regex needed) ──
    if html:
        json_ld_jobs = _extract_from_json_ld(html, url)
        if json_ld_jobs:
            return json_ld_jobs

    # ── Priority 2: pre-parsed job blocks from scraper metadata ──
    if metadata.get("json_ld_jobs"):
        json_ld_jobs = _extract_from_json_ld_list(metadata["json_ld_jobs"], url)
        if json_ld_jobs:
            return json_ld_jobs

    if not text or len(text.strip()) < 50:
        return []

    jobs = []

    # ── Priority 3: regex/NLP heuristics ──
    if _is_single_job_posting(text):
        job = _extract_single_job(text, url, html, metadata)
        if job.title:
            jobs.append(job)
    else:
        blocks = _split_into_job_blocks(text)
        for block in blocks:
            job = _extract_single_job(block, url, html, metadata)
            if job.title:
                jobs.append(job)

    return jobs


def _extract_from_json_ld(html: str, url: str = "") -> list[ExtractedJob]:
    """Parse <script type='application/ld+json'> JobPosting blocks from HTML."""
    import json
    from bs4 import BeautifulSoup

    jobs: list[ExtractedJob] = []
    try:
        soup = BeautifulSoup(html, "lxml")
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "")
            except (json.JSONDecodeError, TypeError):
                continue

            # Handle both single object and @graph arrays
            entries = []
            if isinstance(data, list):
                entries = data
            elif isinstance(data, dict):
                if data.get("@type") == "JobPosting":
                    entries = [data]
                elif "@graph" in data:
                    entries = [e for e in data["@graph"] if e.get("@type") == "JobPosting"]

            for entry in entries:
                if entry.get("@type") != "JobPosting":
                    continue
                job = _job_from_json_ld(entry, url)
                if job.title:
                    jobs.append(job)
    except Exception as e:
        logger.debug(f"JSON-LD extraction failed: {e}")

    return jobs


def _extract_from_json_ld_list(raw_list: list, url: str = "") -> list[ExtractedJob]:
    """Build ExtractedJob list from already-parsed JSON-LD dicts."""
    jobs = []
    for entry in raw_list:
        if isinstance(entry, dict):
            job = _job_from_json_ld(entry, url)
            if job.title:
                jobs.append(job)
    return jobs


def _job_from_json_ld(data: dict, url: str = "") -> ExtractedJob:
    """Convert a schema.org JobPosting dict → ExtractedJob."""
    job = ExtractedJob()

    job.title = data.get("title") or data.get("name") or ""

    # Company
    org = data.get("hiringOrganization", {})
    if isinstance(org, dict):
        job.company = org.get("name", "")

    # Location — can be a single Place or list of Places.
    # Address fields may be plain strings OR nested dicts like {"@type": "Country", "name": "IN"}
    locations_raw = data.get("jobLocation", [])
    if isinstance(locations_raw, dict):
        locations_raw = [locations_raw]
    loc_parts = []
    for place in locations_raw:
        if not isinstance(place, dict):
            continue
        addr = place.get("address", {})
        if not isinstance(addr, dict):
            continue
        raw_fields = [addr.get("addressLocality"), addr.get("addressRegion"), addr.get("addressCountry")]
        str_fields = []
        for f in raw_fields:
            if f is None:
                continue
            if isinstance(f, dict):
                # e.g. {"@type": "Country", "name": "IN"}
                raw = f.get("name") or f.get("@id") or ""
            else:
                raw = str(f)
            # Expand ISO 3166-1 alpha-2 country codes to full names
            str_fields.append(_expand_country_code(raw))
        city = ", ".join(s for s in str_fields if s)
        if city:
            loc_parts.append(city)
    if loc_parts:
        job.location = " | ".join(loc_parts[:3])  # cap at 3 cities

    # Remote
    if data.get("jobLocationType") in ("TELECOMMUTE", "REMOTE"):
        job.location = (job.location + " (Remote)").strip(" |")

    # Employment type
    emp_map = {
        "FULL_TIME": "Full-time", "PART_TIME": "Part-time",
        "CONTRACTOR": "Contract", "TEMPORARY": "Contract",
        "INTERN": "Internship",
    }
    raw_emp = data.get("employmentType", "")
    if isinstance(raw_emp, list):
        raw_emp = raw_emp[0] if raw_emp else ""
    job.job_type = emp_map.get(raw_emp, raw_emp or "Full-time")

    # Salary
    salary_obj = data.get("baseSalary", {})
    if isinstance(salary_obj, dict):
        val = salary_obj.get("value", {})
        if isinstance(val, dict):
            mn, mx, currency = val.get("minValue"), val.get("maxValue"), salary_obj.get("currency", "")
            if mn and mx:
                job.salary = f"{currency} {mn}–{mx}".strip()
            elif mn:
                job.salary = f"{currency} {mn}".strip()

    # Description & skills
    desc = data.get("description", "")
    job.description = desc[:5000] if desc else ""
    job.skills = _extract_skills(desc) if desc else []

    # Apply link
    job.apply_link = data.get("url") or url

    # Date posted
    job.date_posted = data.get("datePosted", "") or ""

    return job


def _is_single_job_posting(text: str) -> bool:
    """Heuristic to determine if text is a single job posting."""
    lines = text.strip().split("\n")
    # Single job postings tend to be longer with "apply" or "responsibilities" sections
    has_sections = any(
        kw in text.lower()
        for kw in ["responsibilities", "requirements", "qualifications", "about the role", "job description"]
    )
    return has_sections or len(text) > 2000


def _split_into_job_blocks(text: str) -> list[str]:
    """Attempt to split a listing page into individual job blocks."""
    # Split on common patterns that separate job listings
    separators = [
        r"\n(?=(?:[A-Z][a-z]+ ){1,5}(?:Engineer|Developer|Manager|Designer|Analyst|Scientist|Lead|Senior|Junior))",
        r"\n-{3,}\n",
        r"\n={3,}\n",
    ]

    blocks = [text]
    for sep in separators:
        new_blocks = []
        for block in blocks:
            parts = re.split(sep, block)
            if len(parts) > 1:
                new_blocks.extend(parts)
            else:
                new_blocks.append(block)
        blocks = new_blocks

    # Filter out blocks that are too short
    return [b.strip() for b in blocks if len(b.strip()) > 100]


def _extract_single_job(text: str, url: str = "", html: str = "", metadata: dict | None = None) -> ExtractedJob:
    """Extract structured data from a single job posting text."""
    metadata = metadata or {}
    job = ExtractedJob()

    # Extract title (usually the first prominent line)
    job.title = _extract_title(text)

    # Extract company
    job.company = _extract_company(text, metadata)

    # Extract location
    job.location = _extract_location(text)

    # Extract skills
    job.skills = _extract_skills(text)

    # Extract job type
    job.job_type = _extract_job_type(text)

    # Extract salary
    job.salary = _extract_salary(text)

    # Extract apply link
    job.apply_link = url

    # Description is the cleaned text
    job.description = text[:5000]  # Truncate to 5000 chars

    return job


def _extract_title(text: str) -> str:
    """Extract job title from text."""
    lines = text.strip().split("\n")

    # Title patterns
    title_patterns = [
        r"(?:job\s+title|position|role|opening)[:\s]+(.+)",
        r"^((?:Senior|Junior|Lead|Staff|Principal|Mid[\s-]?Level)?\s*(?:Software|Full[\s-]?Stack|Frontend|Backend|DevOps|Data|ML|AI|Cloud|Mobile|Web|QA|Test|Product|UX|UI|Systems?|Platform|Infrastructure|Security|Network)\s*(?:Engineer|Developer|Architect|Manager|Designer|Analyst|Scientist|Specialist|Consultant|Administrator|Lead|Director))",
    ]

    for pattern in title_patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            return match.group(1).strip()[:200]

    # Fallback: first non-empty short line
    for line in lines[:5]:
        line = line.strip()
        if 5 < len(line) < 150 and not line.startswith(("http", "www", "#")):
            return line

    return ""


def _extract_company(text: str, metadata: dict) -> str:
    """Extract company name from text."""
    if "company" in metadata:
        return metadata["company"]

    patterns = [
        r"(?:company|employer|organization|firm)[:\s]+([^\n,]{2,80})",
        r"(?:at|@)\s+([A-Z][a-zA-Z\s&.]{2,50}?)(?:\s*[-–|,]|\n)",
        r"(?:about\s+)([A-Z][a-zA-Z\s&.]{2,50}?)(?:\n)",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()

    return ""


def _extract_location(text: str) -> str:
    """Extract location from text."""
    for pattern in LOCATION_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip() if match.lastindex else match.group(0).strip()
    return ""


def _extract_skills(text: str) -> list[str]:
    """Extract tech skills from text."""
    text_lower = text.lower()
    found_skills = []

    for skill in TECH_SKILLS:
        # Use word boundary matching for short skills
        if len(skill) <= 3:
            pattern = rf"\b{re.escape(skill)}\b"
        else:
            pattern = re.escape(skill)

        if re.search(pattern, text_lower):
            found_skills.append(skill.title() if len(skill) > 3 else skill.upper())

    return sorted(set(found_skills))


def _extract_job_type(text: str) -> str:
    """Extract job type from text."""
    for job_type, pattern in JOB_TYPE_PATTERNS.items():
        if re.search(pattern, text, re.IGNORECASE):
            return job_type
    return "Full-time"  # Default


def _extract_salary(text: str) -> str:
    """Extract salary information from text."""
    match = SALARY_PATTERN.search(text)
    if match:
        return match.group(0).strip()
    return ""


def extract_with_spacy(text: str) -> dict:
    """Use spaCy NER for additional entity extraction."""
    try:
        import spacy
        nlp = spacy.load("en_core_web_sm")
        doc = nlp(text[:10000])  # Limit text length

        entities = {
            "organizations": [],
            "locations": [],
            "dates": [],
        }

        for ent in doc.ents:
            if ent.label_ == "ORG":
                entities["organizations"].append(ent.text)
            elif ent.label_ in ("GPE", "LOC"):
                entities["locations"].append(ent.text)
            elif ent.label_ == "DATE":
                entities["dates"].append(ent.text)

        return entities
    except Exception as e:
        logger.warning(f"spaCy extraction failed: {e}")
        return {}
