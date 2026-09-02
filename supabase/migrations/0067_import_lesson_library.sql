-- 0067 · Import the Mount Etna lesson plan library
--
-- 8 clusters, 22 programmes, 66 resources and 42 group goals from the
-- organization's curated lesson library.
--
-- The 11 resources the library flags as containing personal information keep
-- that flag, and 0066's read policy gates them on clinical.client.read.
-- Importing them alongside blank templates with no distinction would have
-- turned a curated boundary back into a shared folder.
--
-- "Not specified in source material." is the library's own placeholder for a
-- field nobody filled in. It is stored as null rather than as that sentence,
-- so a screen showing an age range shows one that exists.
--
-- Guarded on the clinic, keyed on the library's own ids so a re-import updates.
do $seed$
begin
if not exists (select 1 from clinics where id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9') then
  raise notice 'Mount Etna clinic not present; skipping the lesson library import.';
  return;
end if;


insert into lesson_clusters (id, clinic_id, name, description)
values ('cooking-life-skills', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Cooking & Life Skills', 'Functional cooking, kitchen safety, and daily-living routines that build independence, sequencing, and mealtime social skills.')
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into lesson_clusters (id, clinic_id, name, description)
values ('movement-music', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Movement & Music', 'Gross-motor, dance, and music groups targeting coordination, imitation, regulation, and joint engagement.')
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into lesson_clusters (id, clinic_id, name, description)
values ('executive-functioning', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Executive Functioning & School Readiness', 'Sensory-based, neuroaffirming groups building attention, transitions, task completion, and self-regulation.')
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into lesson_clusters (id, clinic_id, name, description)
values ('arts-crafts', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Arts & Crafts', 'Fine-motor and visual-motor skill development through structured art warm-ups paired with creative projects.')
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into lesson_clusters (id, clinic_id, name, description)
values ('stem', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'STEM', 'Hands-on science and building experiments teaching following instructions, tool use, hypotheses, and inference.')
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into lesson_clusters (id, clinic_id, name, description)
values ('social-play', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Social & Play', 'Cooperative and competitive play, sportsmanship, conflict resolution, and friendship skills.')
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into lesson_clusters (id, clinic_id, name, description)
values ('life-readiness', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Life Readiness & Digital Citizenship', 'Entrepreneurship, vocational readiness, online safety, and community/life-skills programs.')
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into lesson_clusters (id, clinic_id, name, description)
values ('summer-camp', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Summer Camp & Seasonal', 'Themed summer day-camp programming blending social play, crafts, sensory regulation, in-camp cooking, music, and community outings.')
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('molten-meals', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'cooking-life-skills', 'Molten Meals', 'molten-meals',
        'Cooking & kitchen life skills', 'A 12-week ABA cooking group teaching kitchen safety, food preparation, following multi-step recipes, teamwork, and mealtime social skills. Each weekly session pairs a safety/skill focus with a hands-on recipe using visual schedules, checklists, assigned roles, and positive reinforcement. Runs at Oshawa and Bowmanville sites.', null,
        'In-person small-group cooking instruction (ABA)', 'Small group', 'Kitchen / group room (Oshawa, Bowmanville)',
        '~2 hours/session; 12 weeks', 12, 'Task analysis + chaining',
        'Tuesday, 2 hrs', 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Also carries legacy names ''Kitchen Safety ABA Group Program'' / ''K is for Kitchen Skills''. Three overlapping curriculum versions exist (legacy 10-session, Q4 2025 13-week recipe rotation, current 12-week 2026 sequence) — recipe/skill mappings differ, so a single authoritative sequence should be confirmed. Parallel Oshawa/Bowmanville site tracks.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('omelets-and-oats', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'cooking-life-skills', 'Omelets and Oats', 'omelets-and-oats',
        'Cooking & life skills for foundational learners', 'A 12-week cooking group for a younger/more foundational cohort covering basic food prep (washing, measuring, mixing, spreading, cutting with safety tools), sequencing, and social skills (cooperation, sharing, turn-taking) plus self-advocacy. 1.5-hour sessions with a video model, hands-on cooking, shared eating, clean-up routine, songs, and food-themed games.', null,
        'In-person small-group cooking with song/game supports', 'Small group', null,
        '1.5 hours/session; 12 weeks', 12, 'Task analysis + naturalistic teaching',
        null, 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Lesson plan doc labelled ''Q3'' though it sits in the Q4 2025 folder. No dedicated goals/data-tracking doc beyond the blank master template. Uses a ''Recipe Stars'' group reinforcement chart and individual token boards.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('magma-movers', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'movement-music', 'Magma Movers', 'magma-movers',
        'Movement / gross motor', 'A themed gross-motor movement group cycling through movement styles (Yoga, Carnival Dance, Afrobeats, Pilates, Zumba, and a Mixed Movement review) in ~2-week blocks. Targets group-based and gross-motor goals with ABA supports, a warm-up, movement activity, snack, and a calm-down/reflection with take-home coloring.', null,
        'In-person group movement class', null, 'Oshawa / Bowmanville',
        '1.5 hours/session; 10-12 weeks', 12, 'Shaping + prompting',
        'Saturday, 1.5 hrs', 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Master weekly template lives in the Rhythm Rangers Curriculum & Goals folder. Master template is a 10-week plan; the Q2 2026 plan extends to 12 weeks adding a Mixed Movement/review block. Data-sheet template internally mislabels the group ''Titan''s Tinkers Group''.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('rhythm-rangers', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'movement-music', 'Rhythm Rangers', 'rhythm-rangers',
        'Music / instrument play', 'A music and instrument social-skills group. Sessions center on a target instrument (e.g., shakers/maracas) with a welcome song, deep-breathing warm-up, instrument introduction and group instrument activity, snack, calm-down relaxation, and themed coloring.', null,
        'In-person group music class', null, 'Group room with adjoining snack/coloring room',
        '1.5 hours/session', 'Not specified in source material.', 'Naturalistic ABA + music routines',
        'Saturday, 1.5 hrs', 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Only one detailed session outline (Class 1 Shakers) was located. No standalone goals bank — the ''Rhythm Rangers'' spreadsheets are client data-sheet templates (PII), not goals. A full week-by-week curriculum should be authored.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('piano-lessons', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'movement-music', 'Piano Lessons', 'piano-lessons',
        'Individualized (1:1) piano instruction', 'ABA-based individualized (1:1) piano instruction for autistic/neurodivergent learners, with goals inspired by ABLLS-R and AFLS across imitation, motor/praxis, visual performance, receptive/expressive language, play & leisure, social interaction, functional academics, executive functioning, and self-management. Includes a baseline assessment intake.', null,
        '1:1 individualized lessons', 'Individual / 1:1', null,
        null, 'Not specified in source material.', '1:1 ABA (ABLLS-R / AFLS aligned)',
        null, 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Goals bank doc: ''IA_ABA-Based Piano Lesson Goals Inspired by ABLLS and AFLS''. Two baseline assessment docs contain client PII and are excluded. This is an individualized program (not a group) — a session/lesson structure is not yet documented.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('summit-scholars', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'executive-functioning', 'Summit Scholars', 'summit-scholars',
        'Executive functioning (sensory-based, neuroaffirming)', 'A sensory-based, neuroaffirming executive functioning group. Each 1.5-hour session follows a visual schedule combining sensory warm-up, an EF skill introduction and discussion (Body Mapping), a structured academic activity, IAS Exploration (Individual Academic Skills with Learning Towers), themed arts & crafts, story time, movement breaks, and decompression/reflection. Delivered on a rotating 12-week thematic curriculum.', 'Early Elementary and Late Elementary',
        'In-person small group; structured visual schedule', null, 'Oshawa / Bowmanville',
        '1.5-3 hrs/session; 12-week thematic cycle', 12, 'Structured teaching + differential reinforcement',
        'Thursday, 3 hrs', 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Master session template defines the IAS data framework (engagement duration, task completion rates, behavioral observations, self-reported preferences). Curriculum is theme-based rather than labelled by discrete EF subskills. Numeric mastery criteria are not stated.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('artemis-artisans', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'arts-crafts', 'Artemis Artisans', 'artemis-artisans',
        'Fine-motor & visual-motor art skills', 'An 11-week arts & crafts group. Each session pairs a structured fine-motor practice activity (Activity 1) that teaches the skills needed for a second, more creative project (Activity 2). Activities increase gradually in complexity while remaining flexible, embedding free play, snack, group movement, and reflection.', null,
        'In-person group; two art activities per session', null, null,
        '1.5-2 hours/session; 11 weeks', 11, 'Modeling + prompting/fading',
        null, 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Q1 and Q2 session plans are near-identical; only Week 5 theme differs (Q1 Valentine''s / Q2 Mother''s Day). No dedicated goals/objective bank, mastery criteria, or data-collection methodology document exists — those fields are unspecified. Data-sheet template mislabels sessions as ''Titan''s Tinkers Group''.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('titans-tinkers', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'stem', 'Titans'' Tinkers', 'titans-tinkers',
        'STEM / building / tinkering', 'A 10-week Art & STEM group in which children complete a hands-on science experiment or art project each week. Each session follows a fixed structure (welcome/warm-up, group expectations & safety rules, key terms, hypothesis, hands-on experiment, break, observation, ''what''s the science'' reflection, clean up, and free play). Targets following instructions, participation, tool use, understanding of STEM concepts, project completion, and inference.', null,
        'In-person group; hands-on experiment + reflection', null, null,
        '~1.5 hours/session; 10 weeks', 10, 'Task analysis + inquiry',
        null, 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'The master curriculum''s template activity list does NOT match the delivered Q1 2026 lessons — the delivered sequence is authoritative here. Some slide-title week numbers conflict with filenames; filename week numbers were used. Uses a Scientific Method worksheet for hypotheses each session.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('peak-playmakers', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'social-play', 'Peak Playmakers', 'peak-playmakers',
        'Play & social skills', 'A 12-week structured social-skills group teaching cooperative and competitive play using a Didactic → Practice → NET → Reflection model. Standard flow: Warm-Up, Teach (Skill of the Day), Activity Block, Game Block 1, Game Block 2, Reflection. Skills are taught didactically then practiced during board games and, in the final phase, generalized to structured video-game play.', '8–12',
        'In-person group; Didactic → Practice → NET → Reflection', null, null,
        '1.5 hours/session; 12 weeks', 12, 'Behaviour Skills Training (BST)',
        'Friday, 1.5 hrs', 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'A standard 1.5-hr session template defines the prompting hierarchy (Model→Verbal→Gestural→Independent) and reinforcement (behavior-specific praise). Weekly decks lack written objectives, mastery criteria, and data-collection methods. Q2 delivery inserts ''Receiving Feedback'' (Week 11) vs the master''s video-game content.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('girls-grove', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'social-play', 'Girls Grove', 'girls-grove',
        'Girls social group', 'A 1.5-hour social-skills group for girls (Q2 2026 scheduled 04/13/2026–06/22/2026) planned across 10 weekly themed sessions targeting conversation, emotional literacy, self-advocacy, and confidence. A PEERS Educational Group handout (''Trading Info'') indicates alignment with the PEERS social-skills model.', null,
        'Girls social group; 1.5-hour sessions', null, null,
        '1.5 hours/session; ~10 weeks', 10, 'PEERS (indicated) / modeling',
        '1.5 hrs', 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Q4 2025 folder is empty. Q2 2026 session plan is an unfilled 10-week template — weekly themes/activities are blank. Curriculum content still needs to be authored.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('etnas-enterprises', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'life-readiness', 'Etna''s Enterprises', 'etnas-enterprises',
        'Entrepreneurship / vocational readiness', 'A 12-week entrepreneurship curriculum in which learners work cooperatively from understanding entrepreneurship and 3D printing through market research, prototyping (Tinkercad), branding, and finally running a booth at a Christmas Market. Embeds social/ABA goals (S-16, S-23, S-30, S-40, S-65) into cooperative group tasks. Suggested market product: customizable 3D printed ornaments.', 'Upper elementary / middle school',
        'In-person small-group; 90-min weekly lessons', 'Small groups', 'Bowmanville / Oshawa',
        '90 minutes/session; 12 weeks', 12, 'Cooperative learning + embedded social goals',
        null, 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Targeted social goals: S-16 (shared activities), S-23 (assign roles), S-30 (conflict resolution), S-40 (proximity to group), S-65 (listening). Weekly presentation decks (Weeks 6-12) and an STL-files subfolder exist. YouTube videos are referenced by title but URLs are largely absent in source.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('net-navigators', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'life-readiness', 'Net Navigators', 'net-navigators',
        'Online safety & digital citizenship', 'A virtual (online) social-skills group teaching internet safety, privacy, respectful digital citizenship, cyberbullying awareness, smart searching, gaming etiquette, and screen-time balance while embedding social/communication goals. Built around a session flow (warm-up, mini-lesson, guided practice, group activity, reflection, wrap-up) and culminating in group projects/showcase.', null,
        'Virtual/online group sessions', null, 'Online / virtual',
        '1.5 hours/session; 10-12 sessions', 12, 'Behaviour Skills Training (BST) + role-play',
        'Monday, 1.5 hrs', 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Two curriculum outlines exist: a 10-12 session cybersafety outline and a 7-session creativity/skills outline (Nov-Dec 2025) — likely a mid-quarter evolution. Targeted goals: S-65, S-20, AR-50, S-30, S-143. Dated weekly .pptx decks exist in a Session presentations subfolder.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('school-is-cool', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'executive-functioning', 'School is Cool', 'school-is-cool',
        'School readiness', null, null,
        'Tuesday/Thursday sessions, Toronto (per folder title)', null, 'Toronto',
        null, 'Not specified in source material.', null,
        null, 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'The assigned Drive folder is EMPTY. No curriculum, lesson, or goal documents were located. Program record is a placeholder pending upload of source material.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('sparks-socials-am', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'social-play', 'Sparks Socials (AM)', 'sparks-socials-am',
        'Early social skills & play', 'Naturalistic ABA targets joint attention, imitation, play expansion, and early peer engagement using visuals and routines.', null,
        'In-person group', null, null,
        '1.5 hrs', 12, 'Naturalistic ABA',
        'Wednesday, 1.5 hrs', 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Listed in the Spring 2026 catalog PDF; no curriculum folder located in the Social Groups Drive. Awaiting source upload.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('sparks-socials-pm', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'social-play', 'Sparks Socials (PM)', 'sparks-socials-pm',
        'Social foundations & school readiness', 'Play-based social learning focusing on routines, transitions, and cooperative play with systematic prompting.', null,
        'In-person group', null, null,
        '1.5 hrs', 12, 'Play-based ABA',
        'Wednesday, 1.5 hrs', 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Listed in the Spring 2026 catalog PDF; no curriculum folder located. Awaiting source upload.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('zeus-zone', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'social-play', 'Zeus Zone', 'zeus-zone',
        'Tween friendships & regulation', 'BST and guided peer interaction teach sportsmanship, cooperation, emotional regulation, and age-appropriate self-awareness.', null,
        'In-person group', null, null,
        '1.5 hrs', 12, 'Behaviour Skills Training (BST)',
        'Thursday, 1.5 hrs', 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Listed in the Spring 2026 catalog PDF; no curriculum folder located. Awaiting source upload.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('green-guardians', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'life-readiness', 'Green Guardians', 'green-guardians',
        'Nature & sustainability', 'Hands-on environmental learning uses task analysis and natural reinforcement to teach responsibility, sequencing, independence, and environmental stewardship.', null,
        'In-person group (Bowmanville)', null, 'Bowmanville',
        '1.5 hrs', 12, 'Task analysis',
        'Saturday, 1.5 hrs', 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Listed in the Spring 2026 catalog PDF; no curriculum folder located. Awaiting source upload.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('lifeskills-launchpad', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'life-readiness', 'LifeSkills Launchpad', 'lifeskills-launchpad',
        'Community & vocational skills', 'Real-world ABA instruction targets functional communication, safety skills, money handling, and life-skills readiness through guided community outings.', null,
        'Community-based group (Bowmanville)', null, 'Bowmanville / community',
        '2 hrs', 12, 'Community-based ABA',
        'Saturday, 2 hrs', 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Listed in the Spring 2026 catalog PDF; no curriculum folder located. Awaiting source upload.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('playba-summer-camp', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'summer-camp', 'PLAYBA Summer Camp', 'playba-summer-camp',
        'Themed summer day camp (social, play, community & life skills)', 'Mount Etna''s PLAYBA summer day camp — a themed, week-by-week camp blending social play, crafts, sensory regulation, in-camp cooking, music, and community outings. Runs in weekly themes (Canada, Vehicles, Around the World, Space, Fairytale) across cohorts in Oshawa (ages 4–7), Bowmanville (ages 8–14), and Toronto (ages 6–12). Daily anchors include Musical Mornings and a Sensory Zone/Resets, with Friday Brunch Days (in-camp cooking).', '4–14 (Oshawa 4–7 · Bowmanville 8–14 · Toronto 6–12)',
        'Full-day themed day camp; small cohorts with 1:1 / 2:1 support', 'Small group (camp cohort)', 'Oshawa, Bowmanville, Toronto (Scarborough & West Toronto planned)',
        'Weekly themes across July–August', 5, 'Thematic day camp with embedded NDBI / NET',
        'Summer (July–August), full day', 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'The shared ''Summer Lesson Plans 2026'' folder is currently empty (awaiting the 2026 plan). Curriculum here is extracted from the 2025 PLAYBA Camp Plan and completed with NDBI/NET. Camp rosters and prep workbooks contain client PII and are excluded (link-only). Themes/outings may change year to year.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('eaf-summer-camp-2027', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'summer-camp', 'EAF Summer Camp 2027', 'eaf-summer-camp-2027',
        '8-week themed summer day camp (Embers for Access × Mount Etna)', 'An 8-week, full-day themed summer camp (ages 6–12) co-delivered by Embers for Access and Mount Etna. Every day follows a predictable flow — arrival & free play, morning circle, motor game, snack, table activity, active play, story & social skills, lunch, quiet time & regulation, a feature block, choice stations, a group game, and closing circle. A rotating feature block anchors each day: Maker Monday (big craft), Try It Tuesday (experiment), Walkabout Wednesday (community outing), Tasty Thursday (cooking/baking), and Festival Friday (theme celebration). Each week carries a social skill of the week.', '6–12',
        'Full-day themed day camp; predictable daily flow with ASD & age adaptations (6–8 / 9–12)', 'Camp group', 'Embers for Access × Mount Etna',
        'Monday to Friday, 9:00 am to 3:00 pm; season start July 05, 2027; 8 weeks', 8, 'Predictable-routine day camp with embedded NDBI/NET + Zones of Regulation',
        'Summer 2027, full day', 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Source: the EAF 2027 8-Week Lesson Plan workbook (bundled in the app under assets/camp-source/). Anchor weeks — Canada & My Community, Feelings & Friendship, Under the Sea — repeat yearly; weeks 2–5 and 7 rotate themes. Full daily plans (Mon–Fri, timed blocks with objectives, materials/links, and ASD/age adaptations) are in the workbook.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('eaf-summer-camp-2028', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'summer-camp', 'EAF Summer Camp 2028', 'eaf-summer-camp-2028',
        '8-week themed summer day camp (Embers for Access × Mount Etna)', 'An 8-week, full-day themed summer camp (ages 6–12) co-delivered by Embers for Access and Mount Etna. Every day follows a predictable flow — arrival & free play, morning circle, motor game, snack, table activity, active play, story & social skills, lunch, quiet time & regulation, a feature block, choice stations, a group game, and closing circle. A rotating feature block anchors each day: Maker Monday (big craft), Try It Tuesday (experiment), Walkabout Wednesday (community outing), Tasty Thursday (cooking/baking), and Festival Friday (theme celebration). Each week carries a social skill of the week.', '6–12',
        'Full-day themed day camp; predictable daily flow with ASD & age adaptations (6–8 / 9–12)', 'Camp group', 'Embers for Access × Mount Etna',
        'Monday to Friday, 9:00 am to 3:00 pm; season start July 03, 2028; 8 weeks', 8, 'Predictable-routine day camp with embedded NDBI/NET + Zones of Regulation',
        'Summer 2028, full day', 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Source: the EAF 2028 8-Week Lesson Plan workbook (bundled in the app under assets/camp-source/). Anchor weeks — Canada & My Community, Feelings & Friendship, Under the Sea — repeat yearly; weeks 2–5 and 7 rotate themes. Full daily plans (Mon–Fri, timed blocks with objectives, materials/links, and ASD/age adaptations) are in the workbook.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_programs
  (id, clinic_id, cluster_id, name, slug, focus, description, age_range, format,
   group_size, setting, duration, weeks, model, day_time, status, drive_url, notes)
values ('eaf-summer-camp-2029', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'summer-camp', 'EAF Summer Camp 2029', 'eaf-summer-camp-2029',
        '8-week themed summer day camp (Embers for Access × Mount Etna)', 'An 8-week, full-day themed summer camp (ages 6–12) co-delivered by Embers for Access and Mount Etna. Every day follows a predictable flow — arrival & free play, morning circle, motor game, snack, table activity, active play, story & social skills, lunch, quiet time & regulation, a feature block, choice stations, a group game, and closing circle. A rotating feature block anchors each day: Maker Monday (big craft), Try It Tuesday (experiment), Walkabout Wednesday (community outing), Tasty Thursday (cooking/baking), and Festival Friday (theme celebration). Each week carries a social skill of the week.', '6–12',
        'Full-day themed day camp; predictable daily flow with ASD & age adaptations (6–8 / 9–12)', 'Camp group', 'Embers for Access × Mount Etna',
        'Monday to Friday, 9:00 am to 3:00 pm; season start July 02, 2029; 8 weeks', 8, 'Predictable-routine day camp with embedded NDBI/NET + Zones of Regulation',
        'Summer 2029, full day', 'Approved',
        'https://drive.google.com/drive/folders/10rSU3zL2MnKDvfSoxkobnV5dJsv3btzP', 'Source: the EAF 2029 8-Week Lesson Plan workbook (bundled in the app under assets/camp-source/). Anchor weeks — Canada & My Community, Feelings & Friendship, Under the Sea — repeat yearly; weeks 2–5 and 7 rotate themes. Full daily plans (Mon–Fri, timed blocks with objectives, materials/links, and ASD/age adaptations) are in the workbook.')
on conflict (id) do update
   set cluster_id = excluded.cluster_id, name = excluded.name, focus = excluded.focus,
       description = excluded.description, age_range = excluded.age_range,
       format = excluded.format, group_size = excluded.group_size, setting = excluded.setting,
       duration = excluded.duration, weeks = excluded.weeks, model = excluded.model,
       day_time = excluded.day_time, status = excluded.status, drive_url = excluded.drive_url,
       notes = excluded.notes;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('shared-r01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', null, 'Spring 2026 Social Programs Catalog (Preview)', 'catalog',
        'Seasonal catalog: program descriptions, day/time, focus, and dates.', 'https://drive.google.com/file/d/1VrZVoUkrXgd1x-X9kgywL2qe8sWAqphF/view', 'spring, social, programs, catalog, preview, all, seasonal, program, descriptions, day, time, focus, dates',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('shared-r02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', null, '90-Minute Weekly Lesson Plan Template', 'template',
        'Reusable 90-min session structure.', 'https://docs.google.com/document/d/1TEL3UOrLOP7R2uvpmIVq8OQI7xSDAFnbc8QjQQEgi7s/edit', 'minute, weekly, lesson, plan, template, shared, reusable, min, session, structure',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('shared-r03', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', null, 'Lead Staff vs Support Staff — Roles & Responsibilities', 'staff-guide',
        'Group Lead (Clinician/RBA/BCBA) vs Support Staff roles across before/during/after group. No PII.', 'https://docs.google.com/document/d/1EKRp28Fe5PoZ8X9ni7OWG5nSs1mv7DojbPjfN7k0zH0/edit', 'lead, staff, support, roles, responsibilities, staff-guide, shared, group, clinician, rba, bcba, across, before, during, after, pii',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('shared-r04', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', null, 'Initial Group Service Plan — Task Analysis & Blurbs', 'template',
        'How-to for the Jane Initial Group Service Plan + pre-approved standardized summary blurbs by group. No PII.', 'https://docs.google.com/document/d/1qShbrggykMuwM2DUgvzsJmpAeevJiDPNQpbA0091Hj8/edit', 'initial, group, service, plan, task, analysis, blurbs, template, shared, how-to, jane, pre-approved, standardized, summary, pii',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('shared-r05', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', null, 'Final Report Task Analysis & Blurbs', 'template',
        'End-of-Treatment-Block summary how-to + pre-approved final blurbs & RBA-only recommendation blurbs by group. No PII.', 'https://docs.google.com/document/d/1Ab1sMwLt7Hsi3zjU5As8guvGq53YPREm5KJ4MnvvWi0/edit', 'final, report, task, analysis, blurbs, template, shared, end-of-treatment-block, summary, how-to, pre-approved, rba-only, recommendation, group, pii',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('shared-r06', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', null, 'Weekly Client Supervision Record — Group Services (Indirect Supervision)', 'template',
        'Blank supervision record form template. No client data.', 'https://docs.google.com/document/d/1GPzgH80SQZiIiWTxrZ1l5gqtcM7kPVKY2kFLk_kJkvM/edit', 'weekly, client, supervision, record, group, services, indirect, template, shared, blank, form, data',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('shared-r07', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', null, 'Model Me Kids — Workbook', 'worksheet',
        'Model Me Kids social-skills workbook.', 'https://drive.google.com/file/d/1fm32xL0RdSbO5IacQ3XosK-fCBhGSKZF/view', 'model, kids, workbook, worksheet, shared, social-skills',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('shared-r08', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', null, 'Model Me Kids — Teacher''s Guide', 'staff-guide',
        'Model Me Kids teacher/staff guide.', 'https://drive.google.com/file/d/1AE1YkoxMARVldtgvhaZ16I6xhZJQVtI_/view', 'model, kids, teacher, guide, staff-guide, shared, staff',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('shared-r09', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', null, 'Model Me Kids — Social Skills Curriculum', 'worksheet',
        'Model Me Kids social-skills curriculum resource.', 'https://drive.google.com/file/d/1fImpNrZkxah4C4eTQw-6aSCi73n-rFP6/view', 'model, kids, social, skills, curriculum, worksheet, shared, social-skills, resource',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('shared-r10', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', null, 'Daily Reflection Worksheet', 'worksheet',
        'General reflection worksheet.', 'https://drive.google.com/file/d/1KNFgt-tsQNfUb8cahfWaftoWSLmCoYBn/view', 'daily, reflection, worksheet, shared, general',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('molten-meals-r01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'molten-meals', 'Kitchen Safety Curriculum (10-session master)', 'template',
        'Original 10-session curriculum outline; predecessor to the 12-week 2026 version.', 'https://docs.google.com/document/d/1fkH2tFarQRbofpaf1-bHkBuzVRNPpVzeE_tnmH0_CPE/edit', 'kitchen, safety, curriculum, session, master, template, molten, meals, original, outline, predecessor, week, version',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('molten-meals-r02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'molten-meals', 'Group Data (Make a copy)', 'datasheet',
        'Blank goal/probe data-collection template (5 goals, Y/N probes, 5-step task analysis). No client data.', 'https://docs.google.com/spreadsheets/d/1Jvkh1iDRAWoelGFQMltFyzG2nR0z2UE7WrWR505yZtc/edit', 'group, data, make, copy, datasheet, molten, meals, blank, goal, probe, data-collection, template, goals, probes, step, task, analysis, client',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('molten-meals-r03', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'molten-meals', 'Master — Molten Meals (Q4 2025 session log)', 'datasheet',
        'Goal template with Q4 2025 recipe rotation log; clinician initials only.', 'https://docs.google.com/spreadsheets/d/1oTuMMcGvEuSuZ3RXS9CfAMfMpoZ3ho1cJwsoVX8MzaU/edit', 'master, molten, meals, session, log, datasheet, goal, template, recipe, rotation, clinician, initials, only',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('molten-meals-r04', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'molten-meals', 'Kitchen Knife Safety Worksheet', 'worksheet',
        'Printable knife-safety worksheet.', 'https://drive.google.com/file/d/1oMQKg5Gx6oQJU9ADwa0iAkxCuc1QBMDz/view', 'kitchen, knife, safety, worksheet, molten, meals, printable, knife-safety',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('molten-meals-r05', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'molten-meals', 'Pancake Day Sequence Cut-and-Paste', 'worksheet',
        'Sequencing cut-and-paste worksheet.', 'https://drive.google.com/file/d/1RKQ_yGHJ603e2vKewv8tKmfM1R7YA0ov/view', 'pancake, day, sequence, cut-and-paste, worksheet, molten, meals, sequencing',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('molten-meals-r06', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'molten-meals', 'Sharp / Not Sharp Sorting', 'worksheet',
        'Sorting worksheet.', 'https://docs.google.com/document/d/14u8OYEkHxfjrAMNApRnec8WmysEn_aAuajnpEBh0g_Y/edit', 'sharp, not, sorting, worksheet, molten, meals',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('molten-meals-r07', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'molten-meals', 'Kitchen Hazards Worksheet', 'worksheet',
        'Kitchen hazards identification worksheet.', 'https://docs.google.com/document/d/159WhSAAW-MuG6vdVz_MGTQwR6kD2RPjUuadUJPx-Uyg/edit', 'kitchen, hazards, worksheet, molten, meals, identification',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('molten-meals-r08', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'molten-meals', 'Molten Meals Weekly Decks (Weeks 2, 4–12 + Bowmanville)', 'other',
        'Remaining weekly slide decks (Google Slides) in the Q4 2025 folder — link to open; not individually catalogued yet.', 'https://drive.google.com/drive/folders/1-R3TEUakOJ8bZqa7UaE_MH04lxcCGySW', 'molten, meals, weekly, decks, weeks, bowmanville, other, remaining, slide, google, slides, folder, link, open, not, individually, catalogued, yet',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('molten-meals-r09', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'molten-meals', 'Site Data Workbooks (Oshawa / Bowmanville)', 'datasheet',
        'Q1 2026 site data workbook — contains client session data. Excluded from library content per policy; link retained for authorized staff.', 'https://docs.google.com/spreadsheets/d/1G5Rn867hhwuFlBh7bN85eMBiAQK-RQNwJVRgMiRzrUE/edit', 'site, data, workbooks, oshawa, bowmanville, datasheet, molten, meals, workbook, contains, client, session, excluded, library, content, policy, link, retained, authorized, staff',
        true)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('omelets-and-oats-r01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'omelets-and-oats', 'Omelets & Oats Master Group Template', 'template',
        'Blank client-info + weekly session report template (empty PII fields). De-identified template only.', 'https://docs.google.com/spreadsheets/d/1aoAFtP8CbWBFe0mtmWHYhRk_4Gc8DrWLC-6sE4BmwvU/edit', 'omelets, oats, master, group, template, blank, client-info, weekly, session, report, empty, pii, fields, de-identified, only',
        true)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('omelets-and-oats-r02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'omelets-and-oats', 'Welcome Parent Sheet — Cooking', 'parent',
        'Parent welcome sheet.', 'https://drive.google.com/file/d/1pF1MBFFLVDZ7QjBCmsiqQOhkDSFjxKTG/view', 'welcome, parent, sheet, cooking, omelets, oats',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('omelets-and-oats-r03', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'omelets-and-oats', 'Weekly Grocery List', 'other',
        'Weekly grocery/shopping list.', 'https://drive.google.com/file/d/1k1o-tQKYGW0iHYgHmP2AEB4pRJeIyskl/view', 'weekly, grocery, list, other, omelets, oats, shopping',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('magma-movers-r01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'magma-movers', 'Animal Adventure Yoga — Sample Script', 'template',
        'Yoga sample script supporting the Week 1 Yoga block.', 'https://drive.google.com/file/d/1orWCMDXArf0QTNHnuKJoMjTZUNj4PYqD/view', 'animal, adventure, yoga, sample, script, template, magma, movers, supporting, week, block',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('magma-movers-r02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'magma-movers', 'MAGMA MOVERS Master Data Templates (9:00 / 11:00 classes)', 'datasheet',
        'Session data-sheet templates (prompt legend FP = Full Physical, PP = Partial Physical, VB = Verbal, POS = Positional, G = Gesture, VS = Visual). May contain client data — excluded per policy.', 'https://docs.google.com/spreadsheets/d/1CYXUz0nhQwde4y0UVrYPuV9az0PL6xVThG_zfq466Bw/edit', 'magma, movers, master, data, templates, classes, datasheet, session, data-sheet, prompt, legend, full, physical, partial, verbal, pos, positional, gesture, visual, may, contain, client, excluded, policy',
        true)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('rhythm-rangers-r01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'rhythm-rangers', 'Homemade Kazoo Instructions', 'other',
        'Craft/materials resource.', 'https://docs.google.com/document/d/1eX98wjdTwDwN9OCa2ugup46jyw4QlPh9Fx7KMAly3Dg/edit', 'homemade, kazoo, instructions, other, rhythm, rangers, craft, materials, resource',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('rhythm-rangers-r02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'rhythm-rangers', 'Session 1 Colouring Sheets', 'visual',
        'Maraca-themed coloring materials.', 'https://docs.google.com/document/d/1zFkBsjHAMMp-OZXtWjjyjK82OlDwrNbEQDpGQwT54CM/edit', 'session, colouring, sheets, visual, rhythm, rangers, maraca-themed, coloring, materials',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('rhythm-rangers-r03', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'rhythm-rangers', 'Rhythm Rangers Data Sheet Template', 'datasheet',
        'Weekly session report template with client PII fields — excluded per policy.', 'https://docs.google.com/spreadsheets/d/1PYbcCVkrwB0bH2kRq7u9AD-MriRACkG7-a42-8d7Ou4/edit', 'rhythm, rangers, data, sheet, template, datasheet, weekly, session, report, client, pii, fields, excluded, policy',
        true)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('piano-lessons-r01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'piano-lessons', 'ABA-Based Piano Lesson Goals (ABLLS/AFLS)', 'template',
        'Goals bank across 12 domains (source for Piano goals).', 'https://docs.google.com/document/d/1vIultH8mHBorhjGQoJTHgGVjuIWuJAx0aMoKzlbjsI8/edit', 'aba-based, piano, lesson, goals, ablls, afls, template, lessons, bank, across, domains, source',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('piano-lessons-r02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'piano-lessons', 'Baseline Piano Lesson Assessment (intake structure)', 'datasheet',
        'Baseline intake — contains client PII. Excluded from library content; link retained for authorized staff.', 'https://docs.google.com/document/d/1Rgiz4ToBSMU2789QvFLx-yQCoHksRP1V3vI0IaRwkWw/edit', 'baseline, piano, lesson, assessment, intake, structure, datasheet, lessons, contains, client, pii, excluded, library, content, link, retained, authorized, staff',
        true)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('summit-scholars-r01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'summit-scholars', 'Summit Scholars — Master Session Template & Goals', 'template',
        'Master 1.5-hr timetable, IAS Data Sheet, and 5 ways to quantify IAS findings.', 'https://docs.google.com/document/d/15TVQqoD6Vk4ewKzNUxTUfOfepSMLqGD6HfTNmsao2Gg/edit', 'summit, scholars, master, session, template, goals, timetable, ias, data, sheet, ways, quantify, findings',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('summit-scholars-r02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'summit-scholars', 'Summit Scholars Group Data Template', 'datasheet',
        'Weekly Session Report template with client PII — excluded per policy.', 'https://docs.google.com/spreadsheets/d/1OyxyQYt_r18d4Frel17J51BeXxK3e95ckARc32xlQx4/edit', 'summit, scholars, group, data, template, datasheet, weekly, session, report, client, pii, excluded, policy',
        true)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('summit-scholars-r03', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'summit-scholars', 'Week 2 Materials (Superhero matching, name tracing)', 'worksheet',
        'Folder: number-matching file folder, name-tracing worksheet, superhero worksheets.', 'https://drive.google.com/drive/folders/1Qgwq1Wqt9K9ctC_Slv1VfR9JgEBB04YU', 'week, materials, superhero, matching, name, tracing, worksheet, summit, scholars, folder, number-matching, file, name-tracing, worksheets',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('summit-scholars-r04', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'summit-scholars', 'Week 3 Materials (Pizza cutting practice)', 'worksheet',
        'Folder: Pizza Cutting Practice PDF.', 'https://drive.google.com/drive/folders/1WYpphuyP0ALwNMwWDWK4TJnBdCXsbJ8N', 'week, materials, pizza, cutting, practice, worksheet, summit, scholars, folder, pdf',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('artemis-artisans-r01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'artemis-artisans', 'Artemis Artisans Data Template', 'datasheet',
        'Blank client data-sheet template with prompt-code legend — excluded per policy. Mislabeled ''Titan''s Tinkers Group''.', 'https://docs.google.com/spreadsheets/d/1gvv-TtuhsQgy7pv2I-fy8RzeSNnkkh8MRuM7vnUwqOw/edit', 'artemis, artisans, data, template, datasheet, blank, client, data-sheet, prompt-code, legend, excluded, policy, mislabeled, titan, tinkers, group',
        true)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('artemis-artisans-r02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'artemis-artisans', 'Under the Sea Craft Pictures', 'visual',
        'Printable/visual craft reference.', 'https://drive.google.com/file/d/1U4SJuDtihZU2OVibTdgWapJpleCKtGRA/view', 'under, sea, craft, pictures, visual, artemis, artisans, printable, reference',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('titans-tinkers-r01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'titans-tinkers', 'ART - Titan''s Tinkers - Lesson Plan, Goals & Structure (master)', 'template',
        'Master 10-week Art & STEM curriculum, 6 goals, sample data sheet, session structure.', 'https://docs.google.com/document/d/18Vfih-0rT-yRgr36LWONKHRxa4gmlVg0krKRMPMnKIo/edit', 'art, titan, tinkers, lesson, plan, goals, structure, master, template, titans, week, stem, curriculum, sample, data, sheet, session',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('titans-tinkers-r02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'titans-tinkers', 'Scientific Method Worksheet', 'worksheet',
        'Hypothesis-writing worksheet used each session.', 'https://drive.google.com/file/d/1u_Ef5kqBUcYE5AvUAh34DsBjUFf-TuIB/view', 'scientific, method, worksheet, titans, tinkers, hypothesis-writing, used, session',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('peak-playmakers-r01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'peak-playmakers', 'Peak Playmakers — Standard Session Template (1.5 hr)', 'template',
        '7-block flow; prompting hierarchy Model→Verbal→Gestural→Independent; reinforcement = behavior-specific praise.', 'https://docs.google.com/document/d/1pOStOx5MDbDpfVy2C4r-FmIXAeqCP_ZrA21gEX3vyYQ/edit', 'peak, playmakers, standard, session, template, block, flow, prompting, hierarchy, model, verbal, gestural, independent, reinforcement, behavior-specific, praise',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('peak-playmakers-r02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'peak-playmakers', 'Peak Playmakers Group Data Template', 'datasheet',
        'Weekly Session Report template with client PII — excluded per policy.', 'https://docs.google.com/spreadsheets/d/1gKqKCKtiahODbCElK990UcjyAd4Tfxi4FrCzXM-ZGmo/edit', 'peak, playmakers, group, data, template, datasheet, weekly, session, report, client, pii, excluded, policy',
        true)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('peak-playmakers-r03', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'peak-playmakers', 'Games Ideas', 'other',
        'Games idea list.', 'https://docs.google.com/document/d/1J1s6wV4HSuKErF1IKVv_icfMXFfxmrtB_ze_uW39D5I/edit', 'games, ideas, other, peak, playmakers, idea, list',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('girls-grove-r01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'girls-grove', 'PEERS Ed Group Session 1 — Trading Info', 'template',
        'PEERS Educational Group Session 1 handout — indicates PEERS model alignment.', 'https://drive.google.com/file/d/1UaRAmBE-bNFcgT2MWXvA2XLwIXfxVIeu/view', 'peers, group, session, trading, info, template, girls, grove, educational, handout, indicates, model, alignment',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('etnas-enterprises-r01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'etnas-enterprises', 'Sample Weekly Lesson Plans (12-week overview)', 'template',
        'Master-curriculum overview; suggested final product: customizable 3D printed ornaments.', 'https://docs.google.com/document/d/1mloV8KQtjxO73JJQGGAb7FMXohzHJmL4LWRMJRjQbOQ/edit', 'sample, weekly, lesson, plans, week, overview, template, etna, enterprises, master-curriculum, suggested, final, product, customizable, printed, ornaments',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('etnas-enterprises-r02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'etnas-enterprises', 'Reflection Worksheet', 'worksheet',
        'Learner reflection worksheet.', 'https://drive.google.com/file/d/1BTpHn4935_c_sAzb0tr2GhyZUJdBsNVU/view', 'reflection, worksheet, etna, enterprises, learner',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('etnas-enterprises-r03', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'etnas-enterprises', 'Etna''s Enterprises Weekly Presentations (Weeks 7–12)', 'other',
        '''All Lesson Plans'' subfolder with weekly decks Weeks 7–12.', 'https://drive.google.com/drive/folders/1zFTbY5B4Z6sP0xgBf3LfNIyIusfQNBIG', 'etna, enterprises, weekly, presentations, weeks, other, all, lesson, plans, subfolder, decks',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('etnas-enterprises-r04', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'etnas-enterprises', 'STL Files for 3D Printer', 'other',
        '3D print STL files subfolder.', 'https://drive.google.com/drive/folders/1AzVXwkP-c77lvR6z_p6Hu-PDZFsse3TI', 'stl, files, printer, other, etna, enterprises, print, subfolder',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('net-navigators-r01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'net-navigators', 'Net Navigators — Goals (From the MOTAS)', 'template',
        'Goal definitions with look-fors (source for Net Navigators goals).', 'https://docs.google.com/document/d/1FyhDmCQwvW3su7o3rt3kCwKRPXIBtVsnUE7egBaHURg/edit', 'net, navigators, goals, motas, template, goal, definitions, look-fors, source',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('net-navigators-r02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'net-navigators', 'CYBERSAFETY (slide deck)', 'visual',
        'Cybersafety slide deck.', 'https://drive.google.com/file/d/1FNfCnydBML99GkB0WjQ5Sobt370OfI_C/view', 'cybersafety, slide, deck, visual, net, navigators',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('net-navigators-r03', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'net-navigators', 'Internet Etiquette (visual)', 'visual',
        'Visual on internet etiquette.', 'https://drive.google.com/file/d/1baerrUHm9Gp9uL98fFIiHrmP3myxKDiO/view', 'internet, etiquette, visual, net, navigators',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('net-navigators-r04', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'net-navigators', 'Net Navigators Weekly Session Presentations', 'other',
        'Dated weekly .pptx/.key decks.', 'https://drive.google.com/drive/folders/1GkxhimeAVFYzzdDgCQ-uso1WX3swC-SL', 'net, navigators, weekly, session, presentations, other, dated, pptx, key, decks',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('playba-summer-camp-r01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'playba-summer-camp', 'Summer Camp Plan (PLAYBA, 2025)', 'template',
        'Weekly camp calendars for the Oshawa, Bowmanville, and Toronto cohorts (themes, outings, daily anchors). Primary source for the camp lessons.', 'https://drive.google.com/file/d/1MQkh1TcKkb4KfFZX5awD7EcJmmMHI0cy/view', 'summer, camp, plan, playba, template, weekly, calendars, oshawa, bowmanville, toronto, cohorts, themes, outings, daily, anchors, primary, source, lessons',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('playba-summer-camp-r02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'playba-summer-camp', 'Summer Lesson Plans 2026 (folder)', 'other',
        'The shared 2026 summer folder — currently empty; add the 2026 PLAYBA plan here and re-run the builder to refresh.', 'https://drive.google.com/drive/folders/1tYbe7IDV4mkkRFB55WtckYSWPAITO8MW', 'summer, lesson, plans, folder, other, playba, camp, shared, currently, empty, add, plan, here, re-run, builder, refresh',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('playba-summer-camp-r03', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'playba-summer-camp', 'Camp Lesson Plans 2025 (folder)', 'other',
        '2025 camp planning folder (plans + prep workbooks).', 'https://drive.google.com/drive/folders/13m5diK0vwxLWwEdYnz68elgEri7trkV-', 'camp, lesson, plans, folder, other, playba, summer, planning, prep, workbooks',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('playba-summer-camp-r04', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'playba-summer-camp', 'Summer Camp 2026 — Camper Roster', 'datasheet',
        'Camp client list / weekly roster by site — contains client PII. Excluded from library content per policy; link retained for authorized staff.', 'https://docs.google.com/spreadsheets/d/1ws-hYBXwM3Lf3fr0Lvd1oIrL5iiIz5ElndfI1QNH3Fg/edit', 'summer, camp, camper, roster, datasheet, playba, client, list, weekly, site, contains, pii, excluded, library, content, policy, link, retained, authorized, staff',
        true)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('playba-summer-camp-r05', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'playba-summer-camp', 'BOWMANVILLE Camp/Group Prep — Summer 2025', 'datasheet',
        'Camp prep workbook. Its planning tabs hold the detailed themed daily lesson plans (e.g., the Fairytale/Fantasy Land day used in the Fairytale Week lesson); other tabs contain client data — the workbook is staff-only/link-only, and only de-identified plan content was formatted into the app.', 'https://docs.google.com/spreadsheets/d/1O-4YamZFlV4KbC9XxcCHA-a-Djl1ah6orfREEdiB5jU/edit', 'bowmanville, camp, group, prep, summer, datasheet, playba, workbook, planning, tabs, hold, detailed, themed, daily, lesson, plans, fairytale, fantasy, land, day, used, week, other, contain, client, data, staff-only, link-only, only, de-identified, plan, content, was, formatted, app',
        true)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('playba-summer-camp-r06', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'playba-summer-camp', 'OSHAWA Camp/Group Prep — Summer 2025', 'datasheet',
        'Camp prep workbook (ages 4–7). Planning tabs hold the themed daily plans; other tabs contain client data — staff-only/link-only; only de-identified plan content was formatted into the app.', 'https://docs.google.com/spreadsheets/d/1dLTEq7ybW8oNU3yy505URMtimaTUiQya_Bg6DhRf8OY/edit', 'oshawa, camp, group, prep, summer, datasheet, playba, workbook, ages, planning, tabs, hold, themed, daily, plans, other, contain, client, data, staff-only, link-only, only, de-identified, plan, content, was, formatted, app',
        true)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('playba-summer-camp-r07', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'playba-summer-camp', 'Around the World — Landmark Materials', 'visual',
        'World-landmark visuals for Around the World Week (Chichen Itza, Christ the Redeemer, Great Wall, Machu Picchu, Petra, Taj Mahal, Colosseum, Eiffel Tower). Linked from the camp prep plan.', 'https://docs.google.com/document/d/1vu9ON5XPUQx-ei6arupIc1q4PejdiSitZR5mt1Gr-9Y/edit', 'around, world, landmark, materials, visual, playba, summer, camp, world-landmark, visuals, week, chichen, itza, christ, redeemer, great, wall, machu, picchu, petra, taj, mahal, colosseum, eiffel, tower, linked, prep, plan',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('playba-summer-camp-r08', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'playba-summer-camp', 'Themed Lesson Plan — The Farm', 'template',
        'Reusable themed daily plan (Time / Activity / Objective / Materials) with a Farm Zones of Regulation and activity bank. Source for The Farm Week.', 'https://docs.google.com/spreadsheets/d/1llyrYCqZyrrDLS2mD6w4tP235ICrGSKHnCXPsJGZvDY/edit', 'themed, lesson, plan, farm, template, playba, summer, camp, reusable, daily, time, activity, objective, materials, zones, regulation, bank, source, week',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('playba-summer-camp-r09', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'playba-summer-camp', 'Themed Lesson Plan — Fantasy Land', 'template',
        'Reusable themed daily plan with Zones of Regulation ''Dragon''s Fire Breath''. Corroborates the Fairytale / Fantasy Land Week lesson.', 'https://docs.google.com/spreadsheets/d/1GA-yQWl5M1RpB1sJSzb3-xgrGrN1xIfu4oM2MHGZahQ/edit', 'themed, lesson, plan, fantasy, land, template, playba, summer, camp, reusable, daily, zones, regulation, dragon, fire, breath, corroborates, fairytale, week',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('playba-summer-camp-r10', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'playba-summer-camp', 'Themed Lesson Plan — Outer Space', 'template',
        'Reusable themed daily plan with Zones of Regulation Space Edition and activity bank. Source for Space / Outer Space Week.', 'https://docs.google.com/spreadsheets/d/1lGQ4kBnnYORddnjW0zSGCAVL7pdpU45XQSlsFh1xQ0w/edit', 'themed, lesson, plan, outer, space, template, playba, summer, camp, reusable, daily, zones, regulation, edition, activity, bank, source, week',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('playba-summer-camp-r11', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'playba-summer-camp', 'Themed Lesson Plan — Under the Sea', 'template',
        'Reusable themed daily plan with Zones of Regulation ''Calm Seas'' and activity bank. Source for Under the Sea Week.', 'https://docs.google.com/spreadsheets/d/19oxGnEl-5qzErnZ7OS7oDUy3uuh7hQo_tPCltGxmZdg/edit', 'themed, lesson, plan, under, sea, template, playba, summer, camp, reusable, daily, zones, regulation, calm, seas, activity, bank, source, week',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('eaf-summer-camp-2027-r01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'eaf-summer-camp-2027', 'EAF 2027 — 8-Week Lesson Plan (workbook)', 'template',
        'Full 8-week daily lesson plans (timed blocks, objectives, materials/links, ASD & age adaptations). Bundled with the app.', 'assets/camp-source/EAF_Summer_Camp_2027_8_Week_Lesson_Plan.xlsx', 'eaf, week, lesson, plan, workbook, template, summer, camp, full, daily, plans, timed, blocks, objectives, materials, links, asd, age, adaptations, bundled, app',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('eaf-summer-camp-2027-r02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'eaf-summer-camp-2027', 'EAF 2027 — Theme Visual Pack', 'visual',
        'Printable theme visuals for the 8 weekly themes. Bundled with the app.', 'assets/camp-source/EAF_Camp_2027_Theme_Visual_Pack.pdf', 'eaf, theme, visual, pack, summer, camp, printable, visuals, weekly, themes, bundled, app',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('eaf-summer-camp-2028-r01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'eaf-summer-camp-2028', 'EAF 2028 — 8-Week Lesson Plan (workbook)', 'template',
        'Full 8-week daily lesson plans (timed blocks, objectives, materials/links, ASD & age adaptations). Bundled with the app.', 'assets/camp-source/EAF_Summer_Camp_2028_8_Week_Lesson_Plan.xlsx', 'eaf, week, lesson, plan, workbook, template, summer, camp, full, daily, plans, timed, blocks, objectives, materials, links, asd, age, adaptations, bundled, app',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('eaf-summer-camp-2028-r02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'eaf-summer-camp-2028', 'EAF 2028 — Theme Visual Pack', 'visual',
        'Printable theme visuals for the 8 weekly themes. Bundled with the app.', 'assets/camp-source/EAF_Camp_2028_Theme_Visual_Pack.pdf', 'eaf, theme, visual, pack, summer, camp, printable, visuals, weekly, themes, bundled, app',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('eaf-summer-camp-2029-r01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'eaf-summer-camp-2029', 'EAF 2029 — 8-Week Lesson Plan (workbook)', 'template',
        'Full 8-week daily lesson plans (timed blocks, objectives, materials/links, ASD & age adaptations). Bundled with the app.', 'assets/camp-source/EAF_Summer_Camp_2029_8_Week_Lesson_Plan.xlsx', 'eaf, week, lesson, plan, workbook, template, summer, camp, full, daily, plans, timed, blocks, objectives, materials, links, asd, age, adaptations, bundled, app',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_resources
  (id, clinic_id, program_id, name, kind, note, url, keywords, contains_client_info)
values ('eaf-summer-camp-2029-r02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'eaf-summer-camp-2029', 'EAF 2029 — Theme Visual Pack', 'visual',
        'Printable theme visuals for the 8 weekly themes. Bundled with the app.', 'assets/camp-source/EAF_Camp_2029_Theme_Visual_Pack.pdf', 'eaf, theme, visual, pack, summer, camp, printable, visuals, weekly, themes, bundled, app',
        false)
on conflict (id) do update
   set program_id = excluded.program_id, name = excluded.name, kind = excluded.kind,
       note = excluded.note, url = excluded.url, keywords = excluded.keywords,
       contains_client_info = excluded.contains_client_info;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('magma-movers-g01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'magma-movers', 'Group Participation in Movement',
        'Participate in group dance/movement for 5 minutes without leaving the group.', 'Engage in the group activity for at least 5 minutes without leaving the activity area.',
        'Duration (minutes) of participation.', 'Observer tracking during each session.',
        'Weekly', 'Focus on gradual increase in group time.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('magma-movers-g02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'magma-movers', 'Imitating Gross Motor Movements',
        'Imitate a simple gross motor movement demonstrated by the instructor.', 'Imitate a variety of simple gross motor movements during the lesson.',
        'Number of correct imitations.', 'Frequency count during class.',
        'Bi-weekly', 'Emphasize successful imitation of at least 3 movements per session.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('magma-movers-g03', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'magma-movers', 'Following Directions for Gross Motor Movements',
        'Follow simple group instructions for movement (e.g., ''Jump like a frog'').', 'Follow 2-3 group movement instructions within the session.',
        'Number of instructions followed successfully.', 'Frequency count during the session.',
        'Bi-weekly', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('magma-movers-g04', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'magma-movers', 'Balancing on One Foot',
        'Balance on one foot for 5 seconds.', 'Balance on one foot for at least 5 seconds during a pilates or yoga session.',
        'Duration (seconds) of successful balancing.', 'Timer or duration tracking.',
        'Weekly', 'Reinforce balance with visual and tactile support if needed.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('magma-movers-g05', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'magma-movers', 'Coordinated Movement (Crossing Midline)',
        'Perform a coordinated movement crossing the body midline.', 'Complete 3-5 midline-crossing movements during activities.',
        'Number of successful midline crossings.', 'Frequency count during activity.',
        'Bi-weekly', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('molten-meals-g01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'molten-meals', 'Imitation of cooking actions',
        'Imitate simple cooking actions (stirring, pouring, spreading) modeled by an adult/peer.', 'Imitate modeled simple cooking actions during the activity.',
        'Probe (Y/N) per session', 'Group data spreadsheet — 5-goal Y/N probe grid with 5-step task analysis.',
        'Each session', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('molten-meals-g02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'molten-meals', 'Following verbal directions',
        'Follow 1- to 3-step verbal directions related to cooking tasks.', 'Follow 1–3 step cooking-related verbal directions.',
        'Probe (Y/N) per session', 'Group data spreadsheet — Y/N probe grid.',
        'Each session', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('molten-meals-g03', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'molten-meals', 'Appropriate use of kitchen items',
        'Demonstrate appropriate use of common kitchen items (spatula, whisk).', 'Use common kitchen tools appropriately during the activity.',
        'Probe (Y/N) per session', 'Group data spreadsheet — Y/N probe grid.',
        'Each session', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('molten-meals-g04', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'molten-meals', 'Labeling cooking items/actions',
        'Label 5–10 common cooking items/ingredients/actions using speech, AAC, or sign.', 'Label 5–10 cooking items/ingredients/actions.',
        'Probe (Y/N) per session', 'Group data spreadsheet — Y/N probe grid.',
        'Each session', 'Supports AAC/sign modalities.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('molten-meals-g05', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'molten-meals', 'Group participation',
        'Attend, raise hand, or wait for a turn with minimal prompts during group instruction.', 'Attend, raise hand, and wait for a turn with minimal prompts.',
        'Probe (Y/N) per session', 'Group data spreadsheet — Y/N probe grid.',
        'Each session', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('titans-tinkers-g01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'titans-tinkers', 'Following Instructions for Art/STEM Projects',
        'Follow simple, 2-step instructions to complete a project.', 'Follow 2-step instructions to complete an art/STEM project.',
        'Number of instructions followed correctly.', 'Frequency count during each session.',
        'Weekly', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('titans-tinkers-g02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'titans-tinkers', 'Engaging in Group STEM Activity',
        'Participate in group STEM activities.', 'Actively participate in at least 50% of group STEM activities.',
        'Duration of participation.', 'Observer tracking during each session.',
        'Weekly', 'Ensure sensory accommodations to keep children engaged.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('titans-tinkers-g03', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'titans-tinkers', 'Using Tools Appropriately',
        'Use scissors, markers, and brushes appropriately.', 'Use tools as instructed in the project.',
        'Number of times tools used correctly.', 'Frequency count during the activity.',
        'Weekly', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('titans-tinkers-g04', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'titans-tinkers', 'Demonstrating Understanding of STEM Concepts',
        'Understand basic STEM concepts (chemical reactions, capillary action).', 'Explain (verbally/non-verbally) a basic concept.',
        'Number of correct explanations/demonstrations.', 'Frequency of correct responses during discussion.',
        'Bi-weekly', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('titans-tinkers-g05', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'titans-tinkers', 'Completing a Project Start to Finish',
        'Complete the entire project with minimal assistance.', 'Finish a full project independently or with limited help.',
        'Completion rate of projects.', 'Observational checklist during each session.',
        'Bi-weekly', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('titans-tinkers-g06', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'titans-tinkers', 'Making Inferences',
        'Make simple inferences based on observations.', 'Make inferences (predicting results / identifying causes).',
        'Number of correct inferences.', 'Frequency count during discussions.',
        'Bi-weekly', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('summit-scholars-g01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'summit-scholars', 'Increase attention span across sessions',
        'Attention span (minutes) during IAS/structured activities.', null,
        'Attention Span (minutes) logged weekly.', 'IAS Data Tracking Sheet.',
        'Weekly', 'Numeric target not specified in source material.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('summit-scholars-g02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'summit-scholars', 'Improve transitions between activities',
        'Transitions rated 1-5.', null,
        'Transitions rated 1-5 weekly.', 'IAS Data Tracking Sheet.',
        'Weekly', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('summit-scholars-g03', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'summit-scholars', 'Identify effective self-regulation strategies / sensory preferences',
        'Self-regulation attempts and use of tools (fidgets, weighted blanket, wobble cushion).', null,
        'Engagement duration per tool; self-reported preference ratings; sensory preference ranking.', 'IAS Data Sheet.',
        'Weekly', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('summit-scholars-g04', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'summit-scholars', 'Increase task completion under different accommodations',
        'Task completion on academic/IAS tasks.', null,
        'Completion Rate (%) by accommodation type.', 'IAS Data Sheet.',
        'Weekly', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('net-navigators-g01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'net-navigators', 'S-65: Listens when others are talking (virtual)',
        'Attentive online listening: mute when not speaking, attend to screen, respond appropriately, wait turn.', 'Demonstrate attentive listening online.',
        'Probe (Y/N) per session', 'Session probe data + clinician narrative notes.',
        'Per session', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('net-navigators-g02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'net-navigators', 'S-20: Takes turns in group discussions',
        'Wait for turn, use hand-raise, respond when called on, share the floor.', 'Participate in online discussions by waiting/hand-raising/responding.',
        'Probe (Y/N) per session', 'Session probe data + clinician notes.',
        'Per session', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('net-navigators-g03', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'net-navigators', 'AR-50: Follows Internet and Computer Rules',
        'Compliance with safe computer/internet rules during virtual sessions.', 'Demonstrate understanding and compliance with group tech rules.',
        'Probe (Y/N) per session', 'Session probe data + clinician notes.',
        'Per session', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('net-navigators-g04', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'net-navigators', 'S-30: Works to resolve conflict during online activities',
        'Problem-solving when disagreements occur in online tasks.', 'Demonstrate problem-solving during online conflicts.',
        'Probe (Y/N) per session', 'Session probe data + clinician notes.',
        'Per session', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('net-navigators-g05', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'net-navigators', 'S-143: Identifies content safe to share online',
        'Differentiate safe vs unsafe online content.', 'Show judgment about what is appropriate to share.',
        'Probe (Y/N) per session', 'Session probe data + clinician notes.',
        'Per session', null)
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('etnas-enterprises-g01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'etnas-enterprises', 'Embedded social goals (S-16, S-23, S-30, S-40, S-65)',
        'S-16 shared activities; S-23 assigning roles; S-30 resolving conflict; S-40 remaining with peers; S-65 listening.', 'Demonstrate targeted social goals during cooperative entrepreneurship group work.',
        null, null,
        null, 'Embedded in weekly lessons; no standalone goals doc / data method in source.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('piano-lessons-g01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'piano-lessons', 'Imitation — 3-note melodic patterns',
        'Imitates 3-note melodic patterns after a live or video model', null,
        null, null,
        null, 'Aligned skill set: ABLLS Imitation A6. From ABLLS/AFLS-inspired goals bank.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('piano-lessons-g02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'piano-lessons', 'Imitation — hand/finger placement',
        'Imitates hand position and finger placement on piano keys', null,
        null, null,
        null, 'Aligned skill set: ABLLS Imitation A8. From ABLLS/AFLS-inspired goals bank.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('piano-lessons-g03', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'piano-lessons', 'Motor / Praxis — finger sequence & bilateral coordination',
        'Follows a sequence of finger numbers to play a simple scale; plays with both hands', null,
        null, null,
        null, 'Aligned skill set: ABLLS Motor F2; AFLS Gross Motor. From ABLLS/AFLS-inspired goals bank.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('piano-lessons-g04', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'piano-lessons', 'Visual Performance — notes to keys',
        'Matches written notes to keys; discriminates quarter vs half notes', null,
        null, null,
        null, 'Aligned skill set: ABLLS Visual Performance C12, C14, C15. From ABLLS/AFLS-inspired goals bank.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('piano-lessons-g05', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'piano-lessons', 'Receptive Language — play instructions',
        'Responds to ''Play middle C''; identifies named keys', null,
        null, null,
        null, 'Aligned skill set: ABLLS Receptive D13, D19, D9. From ABLLS/AFLS-inspired goals bank.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('piano-lessons-g06', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'piano-lessons', 'Expressive Language — labels notes/keys',
        'Labels notes/keys/symbols; answers simple sequence questions', null,
        null, null,
        null, 'Aligned skill set: ABLLS Expressive E9, E12, E11. From ABLLS/AFLS-inspired goals bank.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('piano-lessons-g07', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'piano-lessons', 'Play & Leisure — plays a short song',
        'Plays a short song independently; chooses a preferred song', null,
        null, null,
        null, 'Aligned skill set: AFLS Leisure; ABLLS Play Q2. From ABLLS/AFLS-inspired goals bank.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('piano-lessons-g08', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'piano-lessons', 'Social Interaction — waits, accepts feedback',
        'Waits for a turn; accepts feedback without challenging behavior', null,
        null, null,
        null, 'Aligned skill set: ABLLS Social M8, M14. From ABLLS/AFLS-inspired goals bank.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('piano-lessons-g09', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'piano-lessons', 'Functional Academics — reads beginner music',
        'Reads beginner sheet music with support; tracks left to right', null,
        null, null,
        null, 'Aligned skill set: AFLS Functional Academics; ABLLS Reading R4, R5. From ABLLS/AFLS-inspired goals bank.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('piano-lessons-g10', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'piano-lessons', 'Executive Functioning — schedule & log',
        'Follows a 3-step visual schedule; completes a practice log', null,
        null, null,
        null, 'Aligned skill set: AFLS Organizational Skills; AFLS Vocational Tasks. From ABLLS/AFLS-inspired goals bank.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('piano-lessons-g11', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'piano-lessons', 'Self-Management — timer & break card',
        'Transitions using a timer; uses a break/self-monitoring card', null,
        null, null,
        null, 'Aligned skill set: ABLLS Self-Management P2, P7. From ABLLS/AFLS-inspired goals bank.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('playba-summer-camp-g01', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'playba-summer-camp', 'Participation in camp activities & routines',
        'Joins and stays with themed group activities and daily camp routines with support.', null,
        'Duration / level of participation across the camp day.', 'Daily observation on the camp group sheet (FP = Full Physical, PP = Partial Physical, VB = Verbal, POS = Positional, G = Gesture, VS = Visual).',
        'Daily / per session', 'Camp goal (NDBI/NET); individualized per camper by the supervising clinician.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('playba-summer-camp-g02', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'playba-summer-camp', 'Following the daily schedule & transitions',
        'Follows the visual daily schedule and transitions between activities/anchors with support.', null,
        'Independence at transitions (prompt level).', 'Daily observation / transition tracking.',
        'Daily / per session', 'Camp goal (NDBI/NET); individualized per camper by the supervising clinician.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('playba-summer-camp-g03', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'playba-summer-camp', 'Cooperative play with camp peers',
        'Engages in cooperative and parallel play with peers during camp activities.', null,
        'Frequency / quality of peer interactions.', 'Observation during play blocks.',
        'Daily / per session', 'Camp goal (NDBI/NET); individualized per camper by the supervising clinician.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('playba-summer-camp-g04', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'playba-summer-camp', 'Self-regulation with sensory & coping strategies',
        'Uses the Sensory Zone / coping strategies to stay regulated between activities.', null,
        'Use of coping/sensory tools; reduction in dysregulation.', 'Observation; note strategies used.',
        'Daily / per session', 'Camp goal (NDBI/NET); individualized per camper by the supervising clinician.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

insert into lesson_program_goals
  (id, clinic_id, program_id, goal, target_behavior, objective, measurement,
   data_collection_method, frequency, notes)
values ('playba-summer-camp-g05', 'ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'playba-summer-camp', 'Community-outing safety skills',
        'Demonstrates safety skills (stays with group, follows directions) on community outings.', null,
        'Safe behaviours on outings (prompt level).', 'Observation during outings.',
        'Daily / per session', 'Camp goal (NDBI/NET); individualized per camper by the supervising clinician.')
on conflict (id) do update
   set program_id = excluded.program_id, goal = excluded.goal,
       target_behavior = excluded.target_behavior, objective = excluded.objective,
       measurement = excluded.measurement,
       data_collection_method = excluded.data_collection_method,
       frequency = excluded.frequency, notes = excluded.notes;

end $seed$;
