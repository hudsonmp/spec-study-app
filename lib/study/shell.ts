// Shell exporter — produces a JSON template with every module type pre-stubbed
// using <placeholder> strings. Hudson can paste this into a Google Doc, fill
// in the placeholders, and re-import via the editor.

import type { ProjectContent } from '@/lib/types/study';
import { uid } from '@/lib/types/study';

export function shellProjectContent(): ProjectContent {
  return {
    modules: [
      {
        id: uid(),
        type: 'think_aloud_warmup',
        title: '<title for the think-aloud warmup>',
        taskDescription:
          '<one or two sentences describing what the participant is asked to do during the warmup>',
        // Leave body empty when the script delivers this content verbally;
        // anything authored here renders on-screen to the participant.
        body: '',
        revealedTask: 'DUYTS',
        revealedAnswer: 'STUDY',
        includeScratchPaper: false,
        mandatory: false,
      },
      {
        // Worked example of thinking aloud — display-only, researcher narrates.
        id: uid(),
        type: 'think_aloud_example',
        title: '<title for the think-aloud worked example>',
        taskDescription:
          '<intro shown on the example screen, or leave empty if narrated>',
        body: '<the example body the researcher walks through>',
        revealedTask: '<scrambled word, e.g. NPEPHA>',
        revealedAnswer: '<unscrambled answer, e.g. HAPPEN>',
        walkthroughText:
          '<what the researcher says while demonstrating the think-aloud>',
      },
      {
        id: uid(),
        type: 'task_warmup',
        title: '<title for the task warmup>',
        studyContext:
          '<one short paragraph framing what the participant is specifying — the system, the role, etc.>',
        requirements: [
          {
            id: uid(),
            role: '<role>',
            want: '<capability>',
            so: '<purpose>',
          },
        ],
        initialSpec: [
          {
            id: uid(),
            prompt:
              '<prompt shown before any scenario, e.g. "Write the rules you believe the system must follow.">',
            boxHeight: 2.5,
          },
        ],
        scenarios: [
          {
            id: uid(),
            title: '<scenario title>',
            facilitatorNote:
              '<researcher-only note about what this scenario is meant to elicit>',
            clauses: [
              { id: uid(), type: 'Given', text: '<given clause>' },
              { id: uid(), type: 'And', text: '<and clause>' },
              { id: uid(), type: 'When', text: '<when clause>' },
              { id: uid(), type: 'Then', text: '<then clause>' },
            ],
          },
        ],
      },
      {
        // Worked example task — display-only, researcher walks through it with
        // prefilled spec/entities at each moment. Place it before the warmup.
        id: uid(),
        type: 'task_example',
        title: '<title for the worked example task>',
        studyContext:
          '<researcher-only framing — hidden from the participant on example screens>',
        walkthroughText:
          '<what the researcher says on the example intro screen>',
        requirements: [
          { id: uid(), role: '<role>', want: '<capability>', so: '<purpose>' },
        ],
        initialSpec: [
          {
            id: uid(),
            prompt: '<initial-spec prompt for the example>',
            boxHeight: 2.5,
          },
        ],
        scenarios: [
          {
            id: uid(),
            title: '<example scenario title>',
            facilitatorNote: '<researcher-only note>',
            clauses: [
              { id: uid(), type: 'Given', text: '<given clause>' },
              { id: uid(), type: 'When', text: '<when clause>' },
              { id: uid(), type: 'Then', text: '<then clause>' },
            ],
          },
        ],
        // Display-only snapshots shown at each moment. perScenario length must
        // equal scenarios length.
        prefilled: {
          initial: { spec: '<prefilled spec shown initially>', entities: [] },
          perScenario: [
            {
              read: { spec: '<spec after reading the scenario>', entities: [] },
              revise: { spec: '<spec after revising>', entities: [] },
            },
          ],
        },
      },
      {
        id: uid(),
        type: 'task',
        title: '<title for the task>',
        studyContext:
          '<one short paragraph framing what the participant is specifying — the system, the role, etc.>',
        requirements: [
          {
            id: uid(),
            role: '<role>',
            want: '<capability>',
            so: '<purpose>',
          },
        ],
        // Optional: include a city reference map by uncommenting the cityMap
        // object below. Each landmark / street has integer grid coordinates.
        // cityMap: {
        //   gridSize: 20,
        //   streets: [{ name: '<street name>', from: [0, 10], to: [20, 10] }],
        //   landmarks: [{ label: '<landmark>', x: 5, y: 5 }],
        //   origin: { label: '<origin marker label>', x: 10, y: 10 },
        // },
        initialSpec: [
          {
            id: uid(),
            prompt:
              '<prompt shown before any scenario in this task, e.g. "Write the rules you believe the system must follow.">',
            boxHeight: 2.5,
          },
        ],
        scenarios: [
          {
            id: uid(),
            title: '<scenario 1 title>',
            facilitatorNote: '<researcher-only note for scenario 1>',
            clauses: [
              { id: uid(), type: 'Given', text: '<given clause>' },
              { id: uid(), type: 'And', text: '<and clause>' },
              { id: uid(), type: 'When', text: '<when clause>' },
              { id: uid(), type: 'Then', text: '<then clause>' },
            ],
          },
          // Up to three scenarios per task.
        ],
      },
      {
        id: uid(),
        type: 'retrospective_report',
        title: '<title for the retrospective report>',
        questions: [
          {
            id: uid(),
            text: '<retrospective question 1>',
            boxHeight: 1.1,
          },
        ],
      },
    ],
  };
}
