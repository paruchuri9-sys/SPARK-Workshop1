window.SPARK_DATA = {
  decisions: ["Proceed","Proceed with conditions","Defer pending more information","Oppose"],
  stakeholders: ["Residents / neighbors","City / planning officials","Utility providers","Developer / operator","Schools / taxing entities","Workforce / education","Environmental / resilience"],
  startingFacts: [
    "~300,000 sq. ft. first building",
    "~$1 billion initial construction/equipment investment",
    "~50 permanent jobs plus temporary construction employment",
    "At least 65% property-tax abatement for 30 years",
    "One or more additional data-center buildings may follow if future conditions support expansion",
    "~160 acres rezoned from agricultural to intensive industrial use",
    "Main cooling concept uses treated wastewater effluent rather than drinking water",
    "New pump/pipeline, blowdown discharge, road, utility and power infrastructure are required",
    "Local medium-voltage service can expand to 10 MW for support uses; main load uses separate 230 kV+ service",
    "Some infrastructure timing, financing, long-term utility needs and final project details remain unresolved"
  ],
  stage6Update: [
    "Later public reporting describes eventual high-voltage demand as potentially up to 1,000 MW, while local medium-voltage support service remains around 10 MW.",
    "The cooling concept remains treated-wastewater reuse; the utility says drinking water would be used only for domestic needs.",
    "Later reporting says the developer would pay the cost of additional cooling-water infrastructure, partially resolving an earlier cost-allocation question.",
    "Future phases remain possible, while exact cooling-water demand, ultimate power ramp-up, several final infrastructure terms and the ultimate end user/operator remain unresolved.",
    "The city's existing noise ordinance would require baseline, post-construction and annual testing if the project is built."
  ],
  prompts: {
    2:["Which unknown could most change your recommendation?","Is that something the evidence establishes, or something you still need to verify?"],
    3:["What question are you hoping this evidence will answer?","Which information would be most decision-relevant, not merely interesting?"],
    4:["Did this evidence answer your question or create another one?","Is an outside claim supported by something you can verify?"],
    5:["What evidence matters most to that recommendation?","What is the strongest reason someone in the group disagrees?"],
    6:["Does this new information actually affect your earlier reasoning?","What new or persistent uncertainty matters most now?"],
    7:["What is the strongest case someone who disagrees with you could make?","What would have to be true for the alternative to be defensible?"],
    8:["What would make a condition enforceable rather than aspirational?","What future evidence would make you reopen this decision?"]
  },
  evidence: {
    A:{title:"Fiscal, jobs & community benefits",facts:[
      "~$1 billion initial investment and ~50 permanent jobs are in the public MOU.",
      "At least 65% property-tax abatement for 30 years applies to the initial data center and additional covered buildings.",
      "The company must make an annual contribution to a local foundation during the abatement period; the public MOU excerpt used here does not state the amount.",
      "The agreement calls for a 0.75% franchise fee on high-voltage electricity usage."
    ],unknowns:[
      "Net revenue to the city, county, schools and other taxing entities after abatements.",
      "Construction-job count, duration and wages; permanent-job wage and skill profile.",
      "Value and enforceability of the annual community contribution.",
      "Whether incentives include clawbacks if promised investment/jobs/benefits do not materialize.",
      "How benefits and downside risk change if later phases are built."
    ],source:"Core facts: public MOU / official record."},
    B:{title:"Energy, grid & ratepayer exposure",facts:[
      "The MOU calls for initial 13.8 kV service and a cost/schedule to expand local medium-voltage service to 10 MW.",
      "The main data-center load would use high-voltage service at 230 kV or above.",
      "Later public reporting has described eventual high-voltage demand as potentially up to 1,000 MW; this is not a contractual figure in the 2025 MOU.",
      "The agreement creates a 0.75% city franchise fee on high-voltage electricity usage."
    ],unknowns:[
      "Initial versus ultimate MW demand and ramp-up schedule.",
      "Transmission, substation and generation upgrades required.",
      "Who pays project-specific upgrades and cost overruns.",
      "Potential effect on existing residential/business rates and grid reliability.",
      "Backup generation, batteries, renewables or demand-flexibility plans.",
      "Independent rate-impact or grid-impact study."
    ],source:"13.8 kV, 10 MW, 230 kV+ and fee: public MOU. Up-to-1,000-MW scale: later public reporting."},
    C:{title:"Water, cooling & wastewater",facts:[
      "Cooling is planned around disinfected secondary effluent from the Tupelo Bayou wastewater plant.",
      "A new pump station and supply pipeline would carry treated effluent to the site.",
      "A dedicated blowdown pipeline would discharge non-contact cooling water to the Arkansas River, subject to state/federal permitting.",
      "Conway Corporation reports 22.4 million gallons/day of combined wastewater-treatment capacity across its two treatment facilities.",
      "The utility states potable water would be used only for domestic needs, not the main cooling operation, if the project proceeds."
    ],unknowns:[
      "Actual average-day, maximum-day, annual and peak-hour cooling-water demand.",
      "Consumptive loss versus water returned as discharge.",
      "Available treated effluent at Tupelo Bayou under dry-weather, peak and drought conditions.",
      "Blowdown temperature/chemistry and permit limits.",
      "Water-use reporting, conservation/curtailment and future-phase requirements.",
      "Whether a third-party regional water study should be required."
    ],source:"Effluent infrastructure: public MOU. System capacity and potable-water clarification: Conway Corporation."},
    D:{title:"Infrastructure, construction & public services",facts:[
      "Known infrastructure includes cooling-water pipelines, blowdown discharge, power service, fiber, utility extensions and road work including Lollie Road relocation.",
      "The MOU says timing and financing of infrastructure improvements were being negotiated separately.",
      "Planning staff noted a data center would generally generate less ongoing traffic than many other large industrial uses, but construction traffic was not quantified.",
      "Annexed property requests city police, fire, street maintenance, sanitation and utility access."
    ],unknowns:[
      "Developer versus city/utility responsibility for capital costs and long-term maintenance.",
      "Construction staging, truck routes, road damage, school/bus-route conflicts and construction hours.",
      "Emergency-service, fire-flow and hazardous-material requirements.",
      "Housing/workforce impacts during construction.",
      "Clawbacks, bonds, cost-overrun protections and decommissioning obligations."
    ],source:"Infrastructure and financing status: public MOU. Planning/service context: city planning records."},
    E:{title:"Land use, noise, environment & site risk",facts:[
      "About 160 acres were rezoned from agricultural (A-1) to intensive industrial (I-3) use.",
      "Planning staff found industrial use generally consistent with surrounding zoning; some nearby annexation land lies within mapped 100-year and 500-year floodplain areas.",
      "Conway's data-center noise ordinance requires nearby-resident notification, a third-party baseline sound study, a noise-attenuation plan, a post-construction study at full mechanical capacity and annual testing.",
      "The ordinance sets 65 dBA daytime and 55 dBA nighttime limits at the receiving-property line.",
      "Future additions/expansions must comply with the noise requirements."
    ],unknowns:[
      "Project-specific flood/drainage and stormwater impacts for the final site plan.",
      "Actual modeled/measured noise profile and low-frequency impacts.",
      "Lighting, backup-generator emissions, waste heat, habitat and adjacent-property impacts.",
      "Whether later phases should trigger new environmental/site review.",
      "What objective performance thresholds should be monitored after operation."
    ],source:"Rezoning/planning and noise requirements: official city records."},
    F:{title:"Community, transparency & stakeholder process",facts:[
      "The city held a public committee meeting in May 2026 because residents had questions and officials acknowledged they did not yet have every answer.",
      "The public MOU itself was marked confidential/trade-secret information before becoming publicly accessible.",
      "The developer of record is Forgelight Ventures, LLC; the ultimate end user/operator was not identified in the official record used for this scenario.",
      "Public discussion has centered on utility rates, water, environmental effects, transparency, pace of approval, noise, scale and economic benefit."
    ],unknowns:[
      "What information should be public before a consequential decision.",
      "Whether confidentiality is narrowly tailored and time-limited.",
      "How community input is gathered and weighed.",
      "Whether independent technical experts or joint fact-finding should be used.",
      "Whether the ultimate operator's identity and track record materially change risk.",
      "How disagreement and minority concerns should be preserved rather than averaged away."
    ],source:"Meeting, developer identity and MOU status: official records. Concern themes: public discussion/reporting."},
    G:{title:"Governance, enforceable conditions & long-term oversight",facts:[
      "The MOU anticipates additional buildings and separate future agreements for infrastructure.",
      "Conway already has measurable noise rules, required third-party studies and annual monitoring.",
      "The MOU leaves several utility/infrastructure obligations for later agreements.",
      "City tools can include ordinances, site-plan conditions, utility agreements, road-use agreements and permitting processes."
    ],unknowns:[
      "Which conditions should be prerequisites to approval rather than promises for later negotiation.",
      "Milestones for investment, jobs, infrastructure, water/energy reporting and expansion.",
      "Clawbacks or suspension triggers if commitments are missed.",
      "Assignment/successor language if the project is sold or operated by another entity.",
      "Independent oversight, public reporting and periodic review.",
      "Decommissioning or financial-assurance requirements.",
      "Whether approval should be phased and later phases require fresh review."
    ],source:"Governance mechanisms: official city/MOU record; unanswered items intentionally preserved."}
  }
};
