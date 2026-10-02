# SPARK Alpha 1 Validation Tranche 01

## Goal

Test the core MVP claim:

> Can SPARK reliably uncover worthwhile reasoning opportunities inside ordinary lessons that educators would likely not otherwise notice or enact, while keeping the additions practical?

This tranche is not a student-outcome or efficacy study.

## Frozen runtime

- Model: `gpt-5.6-luna`
- Reasoning: `low`
- DISCOVER prompt: `discover-0.2`
- Schema: `spark-alpha1-0.3`
- Primary signal: at least one surfaced opportunity is **worthwhile + genuinely new + probably otherwise missed**

Do not tune the prompt lesson-by-lesson. Capture failures.

## Tranche

| ID | Lesson | Grade | Domain | Status |
|---|---|---|---|---|
| T01 | [Investigating Genre: The Case of the Classic Detective Story](https://www.readwritethink.org/classroom-resources/lesson-plans/investigating-genre-case-classic) | 9-12 | ELA | baseline-run-exists |
| T02 | [Leading to Great Places in the Middle School Classroom](https://www.readwritethink.org/classroom-resources/lesson-plans/leading-great-places-middle) | 6-8 | ELA | baseline-run-exists |
| T03 | [Exploring Free Speech and Persuasion with Nothing But the Truth](https://www.readwritethink.org/classroom-resources/lesson-plans/exploring-free-speech-persuasion) | 6-8 | ELA/Civics | baseline-run-exists |
| T04 | [Creating a Persuasive Podcast](https://www.readwritethink.org/classroom-resources/lesson-plans/creating-persuasive-podcast) | 6-10 | ELA/Media | new |
| T05 | [Food Waste Audit](https://www.sciencebuddies.org/teacher-resources/lesson-plans/food-waste-audit) | 3-11 | Environmental Science | new |
| T06 | [From Farms to Phytoplankton](https://www.sciencebuddies.org/teacher-resources/lesson-plans/from-farms-to-phytoplankton) | 6-11 | Environmental Science | new |
| T07 | [How Stable is Your Food Web?](https://www.sciencebuddies.org/teacher-resources/lesson-plans/how-stable-is-your-food-web) | 5-9 | Ecology | new |
| T08 | [Make a Water Cycle Model](https://www.sciencebuddies.org/teacher-resources/lesson-plans/water-cycle-model) | 6-8 | Earth Science | new |
| T09 | [Oceanic Circulation: What Keeps the Ocean in Motion?](https://www.sciencebuddies.org/teacher-resources/lesson-plans/oceanic-circulation) | 6-8 | Ocean/Earth Science | new |
| T10 | [Build an Earthquake-Resistant House](https://www.sciencebuddies.org/teacher-resources/lesson-plans/earthquake-resistant-buildings) | 6-8 | Civil Engineering | new |
| T11 | [Design a Seeding Machine to Counteract Deforestation](https://www.sciencebuddies.org/teacher-resources/lesson-plans/deforestation-seeding-machine-challenge) | 6-8 | Environmental Engineering | new |
| T12 | [Documented Rights](https://www.archives.gov/exhibits/documented-rights/education/introduction.html) | Secondary adaptable | History/Civics | new |

## Review

For every surfaced moment, record the six core judgments already exposed in the Alpha review UI:

1. Worthwhile
2. Genuinely new
3. Would otherwise be missed
4. Teacher-usable
5. Consequential
6. Distinct from the other surfaced moments

Use the expanded fields when useful. Preserve all candidates and rejection rationales.

At the run level, record the combined primary signal, misunderstanding, false positives, missed opportunities, redundancy, existing-reasoning richness, overall reaction, confidence, and notes.

## Interpretation

Do not average everything into a single score yet. First examine:

- lessons where the primary signal is met;
- lessons where nothing useful is surfaced;
- false positives;
- missed opportunities;
- redundancy;
- domain-specific versus generic suggestions;
- conditions under which SPARK adds little value.

The tranche is complete when all 12 lessons have a DISCOVER record and run-level review.


## Input-access failures and replacements

The first batch established that T05-T11 could not be retrieved because ScienceBuddies returned HTTP 403 before DISCOVER ran. These records are retained as **INPUT_ACCESS_FAILURE** and excluded from SPARK quality analysis. They are not counted as model/prompt failures.

| Replacement | Replaces | Lesson | Grade | Domain |
|---|---|---|---|---|
| T05R | T05 | [Ups and Downs](https://oceanservice.noaa.gov/education/tutorial_tides/lessons/ups_downs.html) | 9-12 | Earth Science/Oceanography |
| T06R | T06 | [Feel the Heat](https://www.jpl.nasa.gov/edu/resources/lesson-plan/feel-the-heat/) | 4, 6-12 | Engineering/Physical Science |
| T07R | T07 | [Touchdown](https://www.jpl.nasa.gov/edu/resources/lesson-plan/touchdown/) | 3-8 | Engineering |
| T08R | T08 | [On Target](https://www.jpl.nasa.gov/edu/resources/lesson-plan/on-target/) | 6-12 | Engineering/Physics |
| T09R | T09 | [Solar Oven](https://www.jpl.nasa.gov/edu/resources/lesson-plan/solar-oven/) | 6-8 | Engineering/Energy |
| T10R | T10 | [Engineering Design Challenges: Heavy Lifting](https://www.nasa.gov/stem-content/engineering-design-challenges-heavy-lifting/) | 5-12 | Engineering/Physical Science |
| T11R | T11 | [Water Filtration Challenge](https://www.jpl.nasa.gov/edu/resources/lesson-plan/water-filtration-challenge/) | 5-12 | Environmental Engineering |

These replacement lessons preserve the cross-domain test purpose while avoiding provider-specific bot protection.
