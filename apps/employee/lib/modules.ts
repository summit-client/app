/**
 * Summit modules 8 to 13: competency checks in the MEGBA style. Five
 * questions per module, pass at 80% (4 of 5), certificate on pass. Each
 * question tests applied competency, never recall for its own sake.
 */

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;      // index into options
}

export interface SummitModule {
  courseKey: string;
  number: number;
  resourceLabel: string;
  questions: QuizQuestion[];
}

export const PASS_COUNT = 4;

export const SUMMIT_MODULES: SummitModule[] = [
  {
    courseKey: "mod-8-cpi", number: 8, resourceLabel: "CPI training playlist",
    questions: [
      { q: "A client begins pacing and speaking louder during a demand. The first CPI-aligned response is to:", options: ["Present the demand again immediately", "Lower your voice, give space, and reduce the demand's intensity", "Ask a colleague to hold the client's schedule", "End the session"], answer: 1 },
      { q: "The goal of crisis prevention is to:", options: ["Win compliance quickly", "Intervene at the earliest sign of escalation with the least restrictive response", "Document the behaviour after it ends", "Remove all demands for the day"], answer: 1 },
      { q: "During the escalation phase, your body position should be:", options: ["Directly facing the client, close in", "Angled to the side, at a supportive distance", "Behind the client", "Blocking the exit"], answer: 1 },
      { q: "After a crisis resolves, the team should:", options: ["Return to programming and mention nothing", "Debrief, document, and review what preceded the escalation", "Assign consequences", "Cancel the next session"], answer: 1 },
      { q: "Physical intervention is appropriate:", options: ["Whenever a demand is refused", "Only as a last resort when there is imminent risk of harm, by trained staff", "Whenever a supervisor is present", "Never under any circumstances, even at risk of harm"], answer: 1 },
    ],
  },
  {
    courseKey: "mod-9-ndbi", number: 9, resourceLabel: "NDBI staff training video",
    questions: [
      { q: "NDBI teaching happens primarily:", options: ["At a table with massed trials", "Within natural play routines the child is motivated by", "During scheduled quiz blocks", "Only in one-to-one clinic rooms"], answer: 1 },
      { q: "In NDBI, the reinforcer for a communication attempt should be:", options: ["A token from a token board", "Praise delivered later", "The natural consequence of the request itself", "Any edible"], answer: 2 },
      { q: "Following the child's lead means:", options: ["Letting the session run without goals", "Building teaching targets into the activity the child chose", "Removing all adult direction", "Waiting for the child to ask for teaching"], answer: 1 },
      { q: "A balanced NDBI interaction looks like:", options: ["The adult directing every step", "Back-and-forth turns where the adult joins, models and expands", "The child playing alone while data is taken", "Rapid instruction delivery"], answer: 1 },
      { q: "If a child loses interest in the activity you embedded a target in, you should:", options: ["Continue the trial to completion", "Follow the child to the next motivating activity and re-embed the target", "Take a break from data collection", "Switch to a worksheet"], answer: 1 },
    ],
  },
  {
    courseKey: "mod-10-social-thinking", number: 10, resourceLabel: "Social Thinking introduction and training",
    questions: [
      { q: "Social Thinking focuses on teaching:", options: ["Scripted social phrases only", "The thinking that underlies social behaviour, like perspective taking", "Eye contact as an isolated skill", "Turn taking through repetition alone"], answer: 1 },
      { q: "\"Thinking with your eyes\" teaches a learner to:", options: ["Maintain fixed eye contact", "Use gaze to gather information about what others attend to and intend", "Look at the speaker when told", "Avoid distraction"], answer: 1 },
      { q: "Expected and unexpected behaviours are taught as:", options: ["Good and bad behaviours", "Behaviours that change how others think and feel in a context", "Rules that never vary by setting", "Compliance targets"], answer: 1 },
      { q: "A learner who interrupts constantly is best supported by:", options: ["A response cost each interruption", "Teaching how listeners feel and what the group plan is", "Removing group activities", "Ignoring all interruptions"], answer: 1 },
      { q: "Generalizing social thinking means:", options: ["Mastering one social script", "Practising across settings, partners and group sizes", "Passing a written quiz", "Roleplay with one adult only"], answer: 1 },
    ],
  },
  {
    courseKey: "mod-11-caregiver", number: 11, resourceLabel: "Caregiver-Mediated Support training",
    questions: [
      { q: "The goal of caregiver-mediated support is to:", options: ["Have caregivers observe sessions", "Coach caregivers to implement strategies within daily routines", "Replace clinician sessions", "Assign homework worksheets"], answer: 1 },
      { q: "When coaching a caregiver, feedback should be:", options: ["Saved for a monthly summary", "Immediate, specific and behaviour-focused, with strengths named first", "Written only", "Directed at the child"], answer: 1 },
      { q: "Strategies chosen for home routines should be:", options: ["Identical to clinic programs", "Feasible within the family's actual routines and priorities", "The most technical available", "Selected by the caregiver alone"], answer: 1 },
      { q: "If a caregiver reports a strategy is failing at home, the first step is to:", options: ["Reassure them and continue", "Ask them to show you, then problem-solve the routine together", "Drop the goal", "Increase session frequency"], answer: 1 },
      { q: "Fidelity in caregiver-mediated models is measured by:", options: ["The child's mood", "Direct observation of the caregiver implementing the steps", "Caregiver self-report only", "Attendance"], answer: 1 },
    ],
  },
  {
    courseKey: "mod-12-coughdrop", number: 12, resourceLabel: "CoughDrop AAC walkthrough",
    questions: [
      { q: "Before a session using CoughDrop, you should confirm:", options: ["The device is muted", "The learner's board set is loaded and the device is charged", "Icons are hidden to reduce distraction", "The device stays with staff"], answer: 1 },
      { q: "When a learner selects a word on their device, you should:", options: ["Wait for them to also say it aloud", "Honour the communication immediately", "Ask them to repeat it", "Check with a supervisor first"], answer: 1 },
      { q: "Modelling on the device means:", options: ["Completing utterances for the learner", "Touching symbols as you speak, without requiring imitation", "Testing vocabulary daily", "Holding the device toward the learner"], answer: 1 },
      { q: "Vocabulary should be edited:", options: ["Freely, whenever staff prefer a layout", "Through the team, keeping motor plans stable", "Weekly by rotating icons", "Never"], answer: 1 },
      { q: "If the device is unavailable, the learner's communication:", options: ["Pauses until it returns", "Continues through the backup system in their plan", "Switches to hand-over-hand pointing", "Is deferred to caregivers"], answer: 1 },
    ],
  },
  {
    courseKey: "mod-13-lamp", number: 13, resourceLabel: "LAMP AAC walkthrough",
    questions: [
      { q: "LAMP is built on:", options: ["Picture exchange", "Consistent motor patterns for words on a stable layout", "Text-to-speech typing", "Sign language"], answer: 1 },
      { q: "Because LAMP relies on motor planning, icon positions:", options: ["Rotate to maintain interest", "Stay fixed so the motor pattern stays reliable", "Change with each level", "Are hidden until mastered"], answer: 1 },
      { q: "Teaching a new word in LAMP starts with:", options: ["A written definition", "Modelling the motor pattern in a motivating context", "A quiz", "Massed drills out of context"], answer: 1 },
      { q: "The readiness to learn stage emphasizes:", options: ["Quiet hands", "Engagement and shared attention before language demands", "Long table sessions", "Device restrictions"], answer: 1 },
      { q: "Success with LAMP is measured by:", options: ["Speed of icon touches", "Spontaneous, functional use of words across settings", "Session attendance", "Time on device"], answer: 1 },
    ],
  },
];

export const MODULE_BY_COURSE = new Map(SUMMIT_MODULES.map((m) => [m.courseKey, m]));
