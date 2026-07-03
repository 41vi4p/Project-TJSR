"""
Generate a synthetic tech-vs-non-tech job-posting dataset for retraining the
DistilBERT classifier.

Label semantics (matches backend/app/services/classifier/predictor.py intent):
    1 = tech job posting (software / IT / data / security / infra ...)
    0 = everything else (non-tech postings, and news/noise pages the
        scrapers occasionally ingest)

Rows are emitted in the same format the model sees at inference time
(predictor.classify_job_by_id):

    Title: {title}
    Skills: {comma-separated skills}
    {description}

with a fraction of raw-description rows (no Title/Skills prefix) for
robustness, plus hard cases:
    - tech roles at non-tech companies (hospital, bank, farm co-op)   -> 1
    - non-tech roles at tech companies (office manager at a SaaS co)  -> 0
    - tech-adjacent non-tech (tech sales, IT recruiter)               -> 0
    - news articles, incl. tech news full of tech words               -> 0

Usage:
    python generate_tech_dataset.py                 # 8000 rows -> tech_vs_nontech_dataset.csv
    python generate_tech_dataset.py --rows 12000 --seed 7 --out my.csv
"""

import argparse
import csv
import random

# ─────────────────────────────────────────────────────────────────────────────
# Tech role families (label 1)
# ─────────────────────────────────────────────────────────────────────────────

TECH_ROLES = [
    {
        "titles": ["Backend Developer", "Backend Engineer", "API Developer", "Server-Side Engineer"],
        "skills": ["Python", "Java", "Go", "Node.js", "PostgreSQL", "Redis", "Docker", "REST API", "FastAPI", "Spring Boot", "Kafka", "SQL"],
        "duties": [
            "design and build scalable REST and GraphQL APIs",
            "optimise database queries and schema design",
            "own services end to end from design through production support",
            "write clean, well-tested code and participate in code reviews",
            "integrate third-party services and internal microservices",
        ],
    },
    {
        "titles": ["Frontend Developer", "Frontend Engineer", "UI Engineer", "Web Developer"],
        "skills": ["JavaScript", "TypeScript", "React", "Vue", "Angular", "HTML", "CSS", "Tailwind", "Next.js", "Webpack", "Jest"],
        "duties": [
            "build responsive, accessible user interfaces",
            "translate design mockups into pixel-perfect components",
            "improve page performance and Core Web Vitals",
            "maintain a shared component library and design system",
            "collaborate closely with designers and backend engineers",
        ],
    },
    {
        "titles": ["Full Stack Developer", "Full-Stack Engineer", "Software Engineer", "Software Developer", "Application Developer"],
        "skills": ["JavaScript", "TypeScript", "Python", "React", "Node.js", "PostgreSQL", "MongoDB", "Docker", "AWS", "Git", "CI/CD"],
        "duties": [
            "ship features across the entire stack, from database to UI",
            "design new modules and refactor legacy code",
            "work in an agile team with two-week sprints",
            "debug production issues and improve observability",
            "contribute to architectural decisions and technical roadmaps",
        ],
    },
    {
        "titles": ["DevOps Engineer", "Site Reliability Engineer", "SRE", "Platform Engineer", "Infrastructure Engineer", "Cloud Engineer"],
        "skills": ["Kubernetes", "Docker", "Terraform", "AWS", "Azure", "GCP", "Linux", "Ansible", "Prometheus", "Grafana", "CI/CD", "Jenkins", "GitHub Actions", "Bash"],
        "duties": [
            "build and maintain CI/CD pipelines",
            "manage Kubernetes clusters and cloud infrastructure as code",
            "improve system reliability, monitoring and alerting",
            "automate deployment, scaling and incident response",
            "drive down cloud costs and harden infrastructure security",
        ],
    },
    {
        "titles": ["Data Engineer", "ETL Developer", "Data Platform Engineer", "Analytics Engineer"],
        "skills": ["Python", "SQL", "Spark", "Airflow", "Kafka", "dbt", "Snowflake", "BigQuery", "AWS", "Scala", "PostgreSQL"],
        "duties": [
            "design and operate batch and streaming data pipelines",
            "model warehouse tables that analysts can trust",
            "own data quality, lineage and pipeline observability",
            "move terabytes of data reliably and cheaply",
            "partner with data scientists to productionise datasets",
        ],
    },
    {
        "titles": ["Data Scientist", "Machine Learning Engineer", "ML Engineer", "AI Engineer", "Applied Scientist", "NLP Engineer", "Computer Vision Engineer"],
        "skills": ["Python", "PyTorch", "TensorFlow", "scikit-learn", "Pandas", "NumPy", "SQL", "MLflow", "Hugging Face", "Spark", "Statistics"],
        "duties": [
            "train, evaluate and deploy machine learning models",
            "build recommendation, forecasting and NLP systems",
            "design experiments and A/B tests to measure impact",
            "productionise models with proper monitoring and retraining",
            "communicate findings to product and leadership teams",
        ],
    },
    {
        "titles": ["Data Analyst", "BI Analyst", "Business Intelligence Developer", "Analytics Specialist"],
        "skills": ["SQL", "Python", "Tableau", "Power BI", "Excel", "Looker", "dbt", "Statistics", "A/B testing"],
        "duties": [
            "build dashboards and self-serve reporting for stakeholders",
            "turn messy data into clear, actionable analysis",
            "define and track KPIs across the business",
            "write complex SQL against the data warehouse",
            "present insights that drive product and marketing decisions",
        ],
    },
    {
        "titles": ["Security Engineer", "Cybersecurity Analyst", "Security Analyst", "Penetration Tester", "Application Security Engineer", "SOC Analyst"],
        "skills": ["SIEM", "Splunk", "Python", "Linux", "Burp Suite", "Nessus", "OWASP", "Incident Response", "Threat Hunting", "AWS", "Zero Trust"],
        "duties": [
            "monitor, triage and respond to security incidents",
            "run vulnerability assessments and penetration tests",
            "harden cloud and on-prem infrastructure",
            "review code and architectures for security flaws",
            "build detection rules and automate response playbooks",
        ],
    },
    {
        "titles": ["Mobile Developer", "iOS Developer", "Android Developer", "React Native Developer", "Flutter Developer"],
        "skills": ["Swift", "Kotlin", "React Native", "Flutter", "Dart", "iOS", "Android", "Firebase", "REST API", "Git"],
        "duties": [
            "build and ship native mobile applications",
            "optimise app startup time, battery and memory usage",
            "integrate push notifications, analytics and payments",
            "maintain a high crash-free rate across device fleets",
            "work with product and design on new mobile features",
        ],
    },
    {
        "titles": ["QA Engineer", "Test Automation Engineer", "SDET", "Quality Assurance Analyst", "Test Engineer"],
        "skills": ["Selenium", "Cypress", "Playwright", "Python", "Java", "API testing", "JIRA", "CI/CD", "Postman", "Test planning"],
        "duties": [
            "design and maintain automated test suites",
            "build API, UI and regression test frameworks",
            "champion quality across the development lifecycle",
            "reproduce, isolate and document defects clearly",
            "integrate tests into CI pipelines and gate releases",
        ],
    },
    {
        "titles": ["Embedded Software Engineer", "Firmware Engineer", "Embedded Systems Developer", "IoT Engineer"],
        "skills": ["C", "C++", "RTOS", "ARM", "Microcontrollers", "I2C", "SPI", "Embedded Linux", "Python", "Hardware debugging"],
        "duties": [
            "develop firmware for resource-constrained devices",
            "bring up new boards and debug with oscilloscopes and JTAG",
            "implement low-level drivers and communication protocols",
            "optimise for power consumption and real-time constraints",
            "work alongside electrical engineers on new products",
        ],
    },
    {
        "titles": ["Database Administrator", "DBA", "Database Engineer", "Database Reliability Engineer"],
        "skills": ["PostgreSQL", "MySQL", "Oracle", "SQL Server", "Replication", "Backup and recovery", "Performance tuning", "Linux", "Python"],
        "duties": [
            "administer and tune production database clusters",
            "design backup, recovery and high-availability strategies",
            "plan capacity and manage schema migrations safely",
            "troubleshoot slow queries and locking issues",
            "enforce data security and access policies",
        ],
    },
    {
        "titles": ["Systems Administrator", "IT Administrator", "SysAdmin", "IT Support Engineer", "IT Support Specialist", "Help Desk Technician", "Desktop Support Analyst"],
        "skills": ["Windows Server", "Active Directory", "Linux", "Office 365", "Networking", "VMware", "PowerShell", "Ticketing systems", "Intune"],
        "duties": [
            "administer servers, endpoints and business applications",
            "resolve hardware, software and access tickets",
            "manage user accounts, group policy and MDM",
            "patch, monitor and back up company systems",
            "document runbooks and improve IT processes",
        ],
    },
    {
        "titles": ["Network Engineer", "Network Administrator", "NOC Engineer", "Network Security Engineer"],
        "skills": ["Cisco", "Routing", "Switching", "BGP", "OSPF", "Firewalls", "VPN", "SD-WAN", "Wireshark", "Python"],
        "duties": [
            "design, deploy and maintain LAN, WAN and wireless networks",
            "configure routers, switches, firewalls and load balancers",
            "monitor network health and resolve outages fast",
            "implement network segmentation and access controls",
            "automate network configuration and audits",
        ],
    },
    {
        "titles": ["Solutions Architect", "Cloud Architect", "Software Architect", "Enterprise Architect", "Technical Architect"],
        "skills": ["AWS", "Azure", "System design", "Microservices", "Kubernetes", "Terraform", "Event-driven architecture", "Security", "Cost optimisation"],
        "duties": [
            "own the technical architecture for major initiatives",
            "translate business requirements into system designs",
            "set standards for scalability, resilience and security",
            "review designs and mentor engineering teams",
            "evaluate build-vs-buy decisions and new technologies",
        ],
    },
    {
        "titles": ["Game Developer", "Gameplay Programmer", "Unity Developer", "Unreal Engine Developer", "Game Engine Programmer"],
        "skills": ["C++", "C#", "Unity", "Unreal Engine", "Shaders", "Physics", "3D math", "Git", "Optimisation"],
        "duties": [
            "implement gameplay systems, AI and UI features",
            "profile and optimise frame rate across platforms",
            "collaborate with artists and designers on new content",
            "build tools that speed up the content pipeline",
            "fix bugs across the engine and game code",
        ],
    },
    {
        "titles": ["Blockchain Developer", "Smart Contract Engineer", "Web3 Developer", "Solidity Developer"],
        "skills": ["Solidity", "Ethereum", "Rust", "Smart contracts", "Web3.js", "DeFi", "Node.js", "Security auditing"],
        "duties": [
            "design, implement and audit smart contracts",
            "build dApps and integrate wallets and on-chain data",
            "write thorough tests for contract edge cases",
            "monitor deployed protocols and respond to incidents",
            "research L2 scaling and new protocol designs",
        ],
    },
    {
        "titles": ["Engineering Manager", "Technical Lead", "Tech Lead", "Lead Software Engineer", "Head of Engineering", "VP of Engineering"],
        "skills": ["People management", "System design", "Agile", "Python", "AWS", "Roadmapping", "Hiring", "Code review", "Mentoring"],
        "duties": [
            "lead a team of software engineers and own delivery",
            "balance technical debt against feature velocity",
            "run 1:1s, growth conversations and hiring loops",
            "stay hands-on in design reviews and critical code paths",
            "partner with product on quarterly planning",
        ],
    },
    {
        "titles": ["Product Manager", "Technical Product Manager", "Product Owner", "Scrum Master", "Agile Coach"],
        "skills": ["Agile", "Scrum", "Roadmapping", "JIRA", "User research", "SQL", "A/B testing", "Stakeholder management", "Analytics"],
        "duties": [
            "own the product backlog and sprint planning for an engineering team",
            "translate customer problems into clear technical requirements",
            "work daily with developers, designers and data scientists",
            "define success metrics and analyse feature performance",
            "facilitate agile ceremonies and remove delivery blockers",
        ],
    },
    {
        "titles": ["Salesforce Developer", "ERP Developer", "SAP ABAP Developer", "Workday Integration Developer", "ServiceNow Developer"],
        "skills": ["Apex", "Salesforce", "SAP", "ABAP", "REST API", "JavaScript", "SQL", "Integration", "Workflow automation"],
        "duties": [
            "customise and extend the platform with code and configuration",
            "build integrations between enterprise systems",
            "translate business processes into platform workflows",
            "maintain sandboxes, deployments and release cycles",
            "support and train business users on new functionality",
        ],
    },
]

# ─────────────────────────────────────────────────────────────────────────────
# Non-tech role families (label 0)
# ─────────────────────────────────────────────────────────────────────────────

NONTECH_ROLES = [
    {
        "titles": ["Registered Nurse", "Staff Nurse", "ICU Nurse", "Nurse Practitioner", "Home Care Nurse"],
        "skills": ["Patient care", "Medication administration", "Charting", "IV therapy", "BLS certification", "Care planning"],
        "duties": [
            "provide direct patient care and administer medications",
            "monitor vitals and escalate changes in patient condition",
            "coordinate with physicians and allied health teams",
            "educate patients and families on care plans",
            "maintain accurate clinical documentation",
        ],
    },
    {
        "titles": ["Head Chef", "Sous Chef", "Line Cook", "Pastry Chef", "Kitchen Manager"],
        "skills": ["Menu planning", "Food safety", "Inventory management", "Knife skills", "Team leadership", "Cost control"],
        "duties": [
            "lead kitchen operations during busy service",
            "design seasonal menus and daily specials",
            "manage food costs, ordering and supplier relationships",
            "train and supervise kitchen staff",
            "uphold hygiene and food safety standards",
        ],
    },
    {
        "titles": ["Primary School Teacher", "High School Teacher", "Mathematics Teacher", "English Teacher", "Preschool Teacher"],
        "skills": ["Lesson planning", "Classroom management", "Curriculum design", "Parent communication", "Assessment"],
        "duties": [
            "plan and deliver engaging lessons across the curriculum",
            "assess student progress and provide feedback",
            "create an inclusive, well-managed classroom",
            "communicate regularly with parents and guardians",
            "contribute to school events and extracurriculars",
        ],
    },
    {
        "titles": ["Accountant", "Senior Accountant", "Bookkeeper", "Payroll Specialist", "Accounts Payable Clerk", "Tax Accountant"],
        "skills": ["General ledger", "Reconciliations", "Accounts payable", "Payroll", "GAAP", "QuickBooks", "Month-end close"],
        "duties": [
            "own month-end close and balance sheet reconciliations",
            "process invoices, payments and expense reports",
            "prepare financial statements and audit schedules",
            "run payroll and handle statutory filings",
            "improve accounting processes and controls",
        ],
    },
    {
        "titles": ["Sales Representative", "Account Executive", "Business Development Manager", "Territory Sales Manager", "Inside Sales Representative"],
        "skills": ["Prospecting", "Negotiation", "CRM", "Pipeline management", "Cold calling", "Relationship building", "Quota attainment"],
        "duties": [
            "prospect, qualify and close new business",
            "manage a pipeline and forecast accurately",
            "run discovery calls, demos and negotiations",
            "grow revenue within existing accounts",
            "consistently hit and exceed monthly quota",
        ],
    },
    {
        "titles": ["Marketing Manager", "Digital Marketing Specialist", "Brand Manager", "Social Media Manager", "Content Marketing Manager", "SEO Specialist"],
        "skills": ["Campaign management", "Social media", "Copywriting", "Google Ads", "Email marketing", "Brand strategy", "Analytics"],
        "duties": [
            "plan and execute multi-channel marketing campaigns",
            "grow brand awareness and lead generation",
            "manage the content calendar and social channels",
            "run paid media and report on campaign ROI",
            "coordinate with agencies, designers and sales",
        ],
    },
    {
        "titles": ["HR Manager", "Human Resources Generalist", "HR Business Partner", "Talent Acquisition Specialist", "People Operations Coordinator"],
        "skills": ["Employee relations", "Onboarding", "HRIS", "Benefits administration", "Performance management", "Compliance", "Interviewing"],
        "duties": [
            "manage the full employee lifecycle from hire to exit",
            "advise managers on employee relations matters",
            "run onboarding, benefits and performance cycles",
            "keep policies compliant with employment law",
            "champion culture and engagement initiatives",
        ],
    },
    {
        "titles": ["Retail Store Manager", "Assistant Store Manager", "Shift Supervisor", "Retail Sales Associate", "Cashier", "Visual Merchandiser"],
        "skills": ["Customer service", "POS systems", "Merchandising", "Stock management", "Cash handling", "Team scheduling"],
        "duties": [
            "deliver excellent service on the shop floor",
            "manage stock, deliveries and merchandising standards",
            "open and close the store and reconcile tills",
            "coach team members to hit sales targets",
            "handle customer queries, returns and complaints",
        ],
    },
    {
        "titles": ["Delivery Driver", "Truck Driver", "CDL Driver", "Courier", "Forklift Operator", "Warehouse Associate", "Warehouse Operative"],
        "skills": ["Valid driving licence", "Route planning", "Manual handling", "Forklift certification", "Pallet jack", "Inventory scanning"],
        "duties": [
            "deliver goods safely and on schedule",
            "load, unload and check consignments",
            "pick, pack and dispatch orders accurately",
            "keep vehicles and equipment maintained and clean",
            "follow health and safety procedures at all times",
        ],
    },
    {
        "titles": ["Customer Service Representative", "Customer Support Agent", "Call Center Agent", "Client Services Coordinator", "Front Desk Receptionist"],
        "skills": ["Phone etiquette", "Ticketing systems", "Conflict resolution", "Data entry", "Multitasking", "Empathy"],
        "duties": [
            "answer inbound calls, chats and emails from customers",
            "resolve billing, order and account issues",
            "log interactions accurately and follow up on promises",
            "de-escalate difficult conversations with empathy",
            "hit response-time and satisfaction targets",
        ],
    },
    {
        "titles": ["Paralegal", "Legal Assistant", "Legal Secretary", "Compliance Officer", "Contracts Administrator"],
        "skills": ["Legal research", "Document drafting", "Case management", "Filing", "Discovery", "Contract review"],
        "duties": [
            "draft correspondence, contracts and court documents",
            "manage case files, deadlines and filings",
            "conduct legal research and summarise findings",
            "liaise with clients, counsel and court staff",
            "maintain strict confidentiality and accuracy",
        ],
    },
    {
        "titles": ["Financial Analyst", "Investment Analyst", "Credit Analyst", "Investment Banking Analyst", "Wealth Manager", "Insurance Underwriter"],
        "skills": ["Financial modelling", "Excel", "Valuation", "Forecasting", "PowerPoint", "Risk assessment", "Bloomberg"],
        "duties": [
            "build financial models and run scenario analysis",
            "prepare budgets, forecasts and variance reports",
            "evaluate credit risk and investment opportunities",
            "produce board packs and investor materials",
            "support due diligence on transactions",
        ],
    },
    {
        "titles": ["Graphic Designer", "UX Designer", "UI/UX Designer", "Art Director", "Illustrator", "Motion Designer"],
        "skills": ["Adobe Photoshop", "Illustrator", "Figma", "Typography", "Branding", "Layout", "Wireframing", "User research"],
        "duties": [
            "create visual identities, layouts and marketing assets",
            "design user flows, wireframes and prototypes",
            "run user research and usability testing sessions",
            "maintain brand consistency across channels",
            "present concepts to clients and stakeholders",
        ],
    },
    {
        "titles": ["Electrician", "Plumber", "HVAC Technician", "Carpenter", "Welder", "Maintenance Technician", "Auto Mechanic"],
        "skills": ["Blueprint reading", "Hand tools", "Troubleshooting", "Safety compliance", "Preventive maintenance", "Trade certification"],
        "duties": [
            "install, maintain and repair systems and equipment",
            "diagnose faults and complete repairs to code",
            "read technical drawings and job specifications",
            "keep accurate records of work performed",
            "follow site safety rules and wear required PPE",
        ],
    },
    {
        "titles": ["Construction Project Manager", "Site Supervisor", "Civil Site Engineer", "Quantity Surveyor", "Building Inspector"],
        "skills": ["Project scheduling", "Budgeting", "Subcontractor management", "Health and safety", "Blueprint reading", "Procurement"],
        "duties": [
            "manage construction projects from mobilisation to handover",
            "coordinate subcontractors, deliveries and inspections",
            "track budgets, variations and progress claims",
            "enforce safety standards on site",
            "report progress to clients and stakeholders",
        ],
    },
    {
        "titles": ["Operations Manager", "Office Manager", "Administrative Assistant", "Executive Assistant", "Facilities Manager", "Procurement Specialist"],
        "skills": ["Scheduling", "Vendor management", "Budgeting", "Microsoft Office", "Process improvement", "Event coordination"],
        "duties": [
            "keep day-to-day operations running smoothly",
            "manage calendars, travel and correspondence",
            "negotiate with vendors and manage supplies",
            "coordinate meetings, events and office moves",
            "improve administrative processes and documentation",
        ],
    },
    {
        "titles": ["Physiotherapist", "Occupational Therapist", "Dental Hygienist", "Pharmacist", "Radiographer", "Medical Receptionist", "Care Assistant"],
        "skills": ["Patient assessment", "Treatment planning", "Clinical documentation", "Infection control", "Appointment scheduling"],
        "duties": [
            "assess patients and deliver evidence-based treatment",
            "develop and progress individual care plans",
            "maintain accurate treatment records",
            "educate patients on recovery and prevention",
            "work within a multidisciplinary clinical team",
        ],
    },
    {
        "titles": ["Journalist", "Content Writer", "Copywriter", "Editor", "Proofreader", "Communications Officer", "Public Relations Manager"],
        "skills": ["Writing", "Editing", "Interviewing", "AP style", "Research", "Storytelling", "Press releases"],
        "duties": [
            "research, write and edit compelling stories and copy",
            "pitch ideas and meet tight editorial deadlines",
            "interview sources and fact-check rigorously",
            "adapt tone and style for different audiences",
            "manage media relationships and press coverage",
        ],
    },
    {
        "titles": ["Hotel Manager", "Restaurant Manager", "Barista", "Bartender", "Housekeeper", "Concierge", "Event Planner", "Travel Agent"],
        "skills": ["Guest relations", "Reservations", "Staff scheduling", "Food and beverage", "Upselling", "Event coordination"],
        "duties": [
            "deliver memorable guest experiences every shift",
            "manage bookings, budgets and supplier contracts",
            "lead front-of-house teams through busy periods",
            "resolve guest complaints quickly and graciously",
            "plan and execute flawless events and functions",
        ],
    },
    {
        "titles": ["Fitness Trainer", "Personal Trainer", "Yoga Instructor", "Sports Coach", "Lifeguard", "Gym Manager"],
        "skills": ["Program design", "Client motivation", "First aid", "Nutrition basics", "Group instruction", "CPR certification"],
        "duties": [
            "design safe, effective training programmes",
            "coach individuals and group classes",
            "track client progress and adjust plans",
            "maintain equipment and a safe training environment",
            "grow client retention through great service",
        ],
    },
    {
        "titles": ["Real Estate Agent", "Property Manager", "Leasing Consultant", "Mortgage Advisor", "Estate Agent"],
        "skills": ["Negotiation", "Property valuation", "Client relations", "Lead generation", "Contracts", "Market analysis"],
        "duties": [
            "list, market and show residential properties",
            "negotiate offers between buyers and sellers",
            "manage tenancies, renewals and inspections",
            "build a pipeline of buyers and vendors",
            "guide clients through closing processes",
        ],
    },
    {
        "titles": ["Security Guard", "Security Officer", "Loss Prevention Officer", "Door Supervisor"],
        "skills": ["Surveillance", "Incident reporting", "Access control", "Conflict de-escalation", "SIA licence", "Patrolling"],
        "duties": [
            "patrol premises and monitor CCTV systems",
            "control site access and verify credentials",
            "respond to alarms and security incidents",
            "write clear incident reports",
            "provide a visible, reassuring presence",
        ],
    },
    {
        "titles": ["Social Worker", "Case Manager", "Youth Worker", "Counselor", "Community Outreach Coordinator", "Nonprofit Program Coordinator"],
        "skills": ["Case management", "Safeguarding", "Crisis intervention", "Report writing", "Advocacy", "Community engagement"],
        "duties": [
            "manage a caseload of clients with complex needs",
            "conduct assessments and develop support plans",
            "coordinate services across agencies",
            "advocate for clients and safeguard the vulnerable",
            "maintain thorough, timely case notes",
        ],
    },
]

# Tech-adjacent NON-tech (hard negatives — tech words, non-tech work) -> label 0
TECH_ADJACENT_NONTECH = [
    {
        "titles": ["Technology Sales Executive", "SaaS Account Executive", "Cloud Solutions Sales Representative", "Enterprise Software Sales Manager", "IT Sales Consultant"],
        "skills": ["Prospecting", "Negotiation", "Salesforce CRM", "Pipeline management", "SaaS", "Demos", "Quota attainment"],
        "duties": [
            "sell our cloud software platform to enterprise accounts",
            "run product demos alongside sales engineers",
            "build relationships with CTOs and IT directors",
            "manage the full sales cycle from lead to close in Salesforce",
            "exceed quarterly revenue quota for SaaS subscriptions",
        ],
    },
    {
        "titles": ["Technical Recruiter", "IT Recruiter", "Engineering Talent Sourcer", "Tech Talent Acquisition Partner"],
        "skills": ["Sourcing", "LinkedIn Recruiter", "Interviewing", "ATS", "Boolean search", "Offer negotiation", "Employer branding"],
        "duties": [
            "source and screen software engineers, DevOps and data candidates",
            "partner with hiring managers on role requirements for Python and Java teams",
            "manage candidate pipelines in the ATS",
            "coordinate technical interviews and close offers",
            "build talent pools for hard-to-fill engineering roles",
        ],
    },
    {
        "titles": ["Digital Marketing Executive", "Marketing Automation Specialist", "E-commerce Manager", "CRM Marketing Manager"],
        "skills": ["Google Analytics", "HubSpot", "Email marketing", "SEO", "A/B testing", "Excel", "Campaign management"],
        "duties": [
            "run email and paid campaigns for our software products",
            "manage the company website content in the CMS",
            "analyse funnel performance in Google Analytics dashboards",
            "coordinate with the engineering team on tracking pixels",
            "grow online revenue through conversion optimisation",
        ],
    },
    {
        "titles": ["IT Project Coordinator", "Technology Procurement Officer", "Software Asset Manager", "IT Trainer", "Technology Journalist"],
        "skills": ["Vendor management", "Licensing", "Scheduling", "Documentation", "Stakeholder communication", "Microsoft Office"],
        "duties": [
            "coordinate schedules, budgets and vendors for IT projects",
            "manage software licence renewals and true-ups",
            "train staff on business applications and new tools",
            "write articles covering the technology industry",
            "track purchase orders for laptops and cloud subscriptions",
        ],
    },
]

# ─────────────────────────────────────────────────────────────────────────────
# Shared scaffolding
# ─────────────────────────────────────────────────────────────────────────────

TECH_COMPANIES = [
    "a fast-growing SaaS startup", "a venture-backed fintech scale-up", "a leading cloud infrastructure provider",
    "an AI-driven analytics company", "a global e-commerce platform", "a cybersecurity software vendor",
    "a mobile gaming studio", "a healthtech software company", "a developer-tools startup",
]
NONTECH_COMPANIES = [
    "a regional hospital network", "a family-run restaurant group", "a national retail chain",
    "a busy law firm", "a construction and civil engineering contractor", "a logistics and haulage company",
    "an independent school", "a boutique hotel group", "a community non-profit",
    "a manufacturing plant", "an accountancy practice", "a property management agency",
]
LOCATIONS = [
    "Bengaluru", "Mumbai", "Pune", "Hyderabad", "Chennai", "Delhi NCR", "Remote", "Hybrid — Bengaluru",
    "London", "Manchester", "New York, NY", "Austin, TX", "Toronto", "Singapore", "Berlin", "Dubai",
]
SENIORITY = ["", "", "", "Junior ", "Senior ", "Lead ", "Staff ", "Principal ", "Graduate ", "Trainee ", "Associate "]
EMPLOYMENT = ["Full-time", "Full-time", "Full-time", "Part-time", "Contract", "Permanent", "6-month contract", "Internship"]

INTROS = [
    "We are {company} looking for a {title} to join our growing team in {location}.",
    "{company_cap} is hiring a {title} based in {location}.",
    "About the role: {company_cap} seeks an experienced {title}. Location: {location}. {employment}.",
    "Join us! We're {company} and we need a talented {title}. This is a {employment} position ({location}).",
    "Position: {title}\nLocation: {location}\nType: {employment}\nAbout us: we are {company} with a people-first culture.",
    "Our client, {company}, has an immediate opening for a {title} in {location}.",
]
REQ_LINES = [
    "You have {years}+ years of relevant experience.",
    "Requirements: {years}+ years in a similar role, strong communication skills, and a can-do attitude.",
    "The ideal candidate brings {years} years of hands-on experience and thrives in a fast-paced environment.",
    "Minimum {years} years of experience required. A relevant degree or certification is a plus.",
]
BENEFITS = [
    "We offer competitive salary, health insurance and generous paid leave.",
    "Benefits include performance bonus, flexible hours and professional development budget.",
    "Salary range: {salary}. Plus pension, wellness allowance and team events.",
    "Compensation: {salary} depending on experience.",
    "In return we offer {salary}, hybrid working and clear career progression.",
]
EEO = [
    "We are an equal opportunity employer and value diversity at our company.",
    "All qualified applicants will receive consideration without regard to race, religion, gender or age.",
    "We celebrate diversity and are committed to creating an inclusive environment for all employees.",
    "",
    "",
]
APPLY = [
    "To apply, submit your CV and a short cover letter.",
    "Apply now — interviews are being scheduled on a rolling basis.",
    "Click apply to start your application. Immediate start available.",
    "",
]
SALARIES = ["₹8–15 LPA", "₹18–30 LPA", "₹5–9 LPA", "$70,000–$95,000", "$110,000–$150,000", "£35,000–£50,000", "£55,000–£75,000", "€60,000–€80,000", "competitive"]

# News/noise pages the scrapers sometimes ingest (label 0) — including tech
# news, which is full of tech words but is not a job posting.
NEWS_TEMPLATES = [
    "{co} announces plans to cut {n} jobs as part of a restructuring effort. The {ind} company said the layoffs would affect teams across {loc}, with analysts calling the move a response to slowing demand.",
    "{co} reports record quarterly revenue, beating expectations. Shares rose {n}% in early trading as the {ind} giant credited strong growth in its {loc} operations.",
    "Unemployment rate falls to a {n}-year low, government figures show. Economists say hiring in the {ind} sector remains robust despite pressures in {loc}.",
    "{co} opens new {ind} campus in {loc}, promising to create {n} jobs over the next three years, local officials announced on Tuesday.",
    "Why {ind} hiring is slowing: recruiters across {loc} report longer hiring cycles and fewer openings, with {co} among firms freezing headcount this quarter.",
    "{co} launches a new artificial intelligence platform for {ind} customers. The product, unveiled at a conference in {loc}, uses machine learning models trained on billions of data points, executives said.",
    "Developers react to {co}'s latest framework release: the update brings faster builds, improved TypeScript support and breaking API changes that have divided the open-source community in {loc}.",
    "Cybersecurity researchers at {co} disclose a critical vulnerability affecting {ind} systems. Patches have been released and administrators in {loc} are urged to update immediately.",
    "The {ind} job market in {loc}: our annual survey of {n} professionals reveals salary trends, remote-work preferences and the skills employers want most this year.",
]
NEWS_COMPANIES = ["TechNova", "Meridian Group", "Apex Industries", "BlueSky Systems", "Vertex Global", "Northwind Corp", "Stellar Dynamics", "Quantum Holdings"]
NEWS_INDUSTRIES = ["technology", "software", "retail", "manufacturing", "banking", "healthcare", "logistics", "energy", "telecom"]


def _compose(role: dict, label: int, rng: random.Random, company_pool: list[str]) -> tuple[str, int]:
    title = rng.choice(SENIORITY) + rng.choice(role["titles"])
    if rng.random() < 0.15:
        title += rng.choice([" - Remote", " (Hybrid)", " - Immediate Start", " II", " (Night Shift)" if label == 0 else " III"])
    if rng.random() < 0.07:
        title = title.upper()

    company = rng.choice(company_pool)
    location = rng.choice(LOCATIONS)
    employment = rng.choice(EMPLOYMENT)
    years = rng.choice([1, 2, 2, 3, 3, 4, 5, 5, 7, 8, 10])
    salary = rng.choice(SALARIES)

    parts = [rng.choice(INTROS).format(
        company=company, company_cap=company[0].upper() + company[1:],
        title=title, location=location, employment=employment,
    )]
    duties = rng.sample(role["duties"], k=rng.randint(2, min(4, len(role["duties"]))))
    if rng.random() < 0.5:
        parts.append("Responsibilities: " + "; ".join(d.capitalize() for d in duties) + ".")
    else:
        parts.append(" ".join(f"You will {d}." for d in duties))
    parts.append(rng.choice(REQ_LINES).format(years=years))
    if rng.random() < 0.7:
        parts.append(rng.choice(BENEFITS).format(salary=salary))
    parts.append(rng.choice(EEO))
    parts.append(rng.choice(APPLY))
    description = " ".join(p for p in parts if p)

    # Skills line: usually present, sometimes empty (mirrors real pipeline where
    # the NLP extractor found nothing), occasionally with an off-list extra.
    if rng.random() < 0.85:
        k = rng.randint(2, min(9, len(role["skills"])))
        skills = rng.sample(role["skills"], k=k)
        if rng.random() < 0.2:
            skills.append(rng.choice(["Communication", "Teamwork", "English", "Problem solving", "Time management"]))
        skills_line = ", ".join(skills)
    else:
        skills_line = ""

    # 85% inference format, 15% raw description for robustness
    if rng.random() < 0.85:
        text = f"Title: {title}\nSkills: {skills_line}\n{description[:1000]}"
    else:
        text = f"{title}. {description}"[:1100]
    return text, label


def _compose_news(rng: random.Random) -> tuple[str, int]:
    text = rng.choice(NEWS_TEMPLATES).format(
        co=rng.choice(NEWS_COMPANIES), n=rng.choice([3, 5, 8, 12, 26, 400, 1200, 8500]),
        ind=rng.choice(NEWS_INDUSTRIES), loc=rng.choice(LOCATIONS),
    )
    # News arrives through the same pipeline, so it may also get the prefix
    # treatment with a headline-ish title and no skills.
    if rng.random() < 0.5:
        headline = text.split(".")[0][:80]
        text = f"Title: {headline}\nSkills: \n{text}"
    return text, 0


def generate(rows: int, seed: int) -> list[tuple[str, int]]:
    rng = random.Random(seed)
    per_class = rows // 2
    data: list[tuple[str, int]] = []

    # Label 1: tech postings. ~15% are "hard positives" at non-tech companies.
    for i in range(per_class):
        role = rng.choice(TECH_ROLES)
        pool = NONTECH_COMPANIES if rng.random() < 0.15 else TECH_COMPANIES
        data.append(_compose(role, 1, rng, pool))

    # Label 0: 72% ordinary non-tech postings, 20% tech-adjacent hard
    # negatives, 8% news/noise pages.
    n_news = int(per_class * 0.08)
    n_adj = int(per_class * 0.20)
    n_plain = per_class - n_news - n_adj
    for i in range(n_plain):
        role = rng.choice(NONTECH_ROLES)
        pool = TECH_COMPANIES if rng.random() < 0.15 else NONTECH_COMPANIES
        data.append(_compose(role, 0, rng, pool))
    for i in range(n_adj):
        data.append(_compose(rng.choice(TECH_ADJACENT_NONTECH), 0, rng, TECH_COMPANIES))
    for i in range(n_news):
        data.append(_compose_news(rng))

    rng.shuffle(data)
    return data


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--rows", type=int, default=8000)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default="tech_vs_nontech_dataset.csv")
    args = ap.parse_args()

    data = generate(args.rows, args.seed)
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["job_description", "label"])
        w.writerows(data)

    n1 = sum(1 for _, l in data if l == 1)
    uniq = len({t for t, _ in data})
    lens = sorted(len(t) for t, _ in data)
    print(f"wrote {len(data)} rows -> {args.out}")
    print(f"label 1 (tech): {n1} | label 0 (non-tech/news): {len(data) - n1}")
    print(f"unique texts: {uniq} ({uniq / len(data):.1%})")
    print(f"char length p5/p50/p95: {lens[len(lens)//20]}/{lens[len(lens)//2]}/{lens[len(lens)*19//20]}")


if __name__ == "__main__":
    main()
