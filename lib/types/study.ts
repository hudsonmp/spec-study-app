// Module-based project shape. A project (DB row in `studies`) has an ordered
// list of modules. Each module is one of three types: think-aloud warmup,
// task warmup, or task. Participants experience modules in order; the editor
// reorders/edits them.

export type ClauseType = 'Given' | 'And' | 'When' | 'Then';

// Per-clause evolution marker. Used in cumulative scenarios where each
// subsequent scenario is a copy of the previous with deltas: `new` chips
// highlight what this scenario adds, `superseded` strikes through clauses
// that are no longer valid. Absent on most clauses (the carried-over ones).
export type ClauseMarker = 'new' | 'superseded';

export type Clause = {
  id: string;
  type: ClauseType;
  text: string;
  marker?: ClauseMarker;
};

export type Requirement = {
  id: string;
  role: string;
  want: string;
  so: string;
};

export type SeededMarkerKind = 'vehicle' | 'person';
export type SeededVehicleColor = 'red' | 'blue' | 'green';
export type SeededPersonLetter = 'A' | 'B' | 'C';

// A marker placed by the researcher at a known landmark for this scenario.
// Position is referenced by landmark label so it survives map-template edits;
// if the landmark is deleted, the marker is rendered at the cityMap.origin.
export type SeededMarker =
  | {
      kind: 'vehicle';
      color: SeededVehicleColor; // label is derived: red=Vehicle 1, blue=Vehicle 2, green=Vehicle 3
      landmarkLabel: string;     // matches CityMapLandmark.label or origin.label
    }
  | {
      kind: 'person';
      letter: SeededPersonLetter; // label derived: Person A/B/C
      personColor: string;        // hex or palette key, picked by researcher
      landmarkLabel: string;
    };

export const VEHICLE_COLOR_TO_NUMBER: Record<SeededVehicleColor, 1 | 2 | 3> = {
  red: 1,
  blue: 2,
  green: 3,
};

export const VEHICLE_HEX: Record<SeededVehicleColor, string> = {
  red: '#c44',
  blue: '#36a',
  green: '#3a6',
};

export const PERSON_PALETTE: string[] = ['#d97a3a', '#7d50b8', '#2f9b9b'];

export type Scenario = {
  id: string;
  title: string;
  facilitatorNote: string;
  clauses: Clause[];
  seededMarkers?: SeededMarker[];
};

export type CityMapLandmark = {
  label: string;
  x: number;
  y: number;
  labelDX?: number;
  labelDY?: number;
  labelAnchor?: 'start' | 'middle' | 'end';
};

export type CityMapStreet = {
  name: string;
  from: [number, number];
  to: [number, number];
};

export type CityMap = {
  gridSize: number;
  streets: CityMapStreet[];
  landmarks: CityMapLandmark[];
  origin: CityMapLandmark;
};

export type SpecSubsection = {
  id: string;
  prompt: string;
  boxHeight: number;
};

export type RetrospectiveItem = {
  id: string;
  text: string;
  boxHeight: number;
};

// =========================== Modules ===========================

export type ModuleType =
  | 'think_aloud_warmup'
  | 'task_warmup'
  | 'task'
  | 'retrospective_report';

export type ThinkAloudWarmupModule = {
  id: string;
  type: 'think_aloud_warmup';
  title: string;
  taskDescription: string;
  body: string;
  revealedTask: string;
  includeScratchPaper: boolean;
  mandatory: boolean;
};

// Shared task-shaped content. Used by both Task and TaskWarmup (warmup is the
// same UI, just rendered as "Warmup" and excluded from analysis).
// Retrospective is NOT here — it lives in its own module type now.
export type TaskContent = {
  title: string;
  studyContext: string;
  requirements: Requirement[];
  cityMap?: CityMap;
  initialSpec: SpecSubsection[];
  scenarios: Scenario[]; // 1-3 enforced by the editor
};

export type RetrospectiveReportModule = {
  id: string;
  type: 'retrospective_report';
  title: string;
  questions: RetrospectiveItem[];
};

export type TaskWarmupModule = {
  id: string;
  type: 'task_warmup';
} & TaskContent;

export type TaskModule = {
  id: string;
  type: 'task';
} & TaskContent;

export type Module =
  | ThinkAloudWarmupModule
  | TaskWarmupModule
  | TaskModule
  | RetrospectiveReportModule;

// =========================== Project ===========================

export type ProjectVisibility = 'shown' | 'hidden' | 'archived';

export type ProjectContent = {
  modules: Module[];
};

// Server-side project record (matches studies row + parsed authored_data)
export type LoadedProject = {
  id: string;
  slug: string;
  name: string;
  visibility: ProjectVisibility;
  content: ProjectContent;
  updated_at: string;
};

// =========================== Helpers ===========================

export const uid = () => Math.random().toString(36).slice(2, 10);

export function emptyContent(): ProjectContent {
  return { modules: [] };
}

export function newThinkAloudWarmup(): ThinkAloudWarmupModule {
  return {
    id: uid(),
    type: 'think_aloud_warmup',
    title: 'Think-aloud warmup',
    taskDescription: '',
    body: '',
    revealedTask: '',
    includeScratchPaper: false,
    mandatory: false,
  };
}

function newTaskContent(): TaskContent {
  return {
    title: 'New task',
    studyContext: '',
    requirements: [],
    scenarios: [
      {
        id: uid(),
        title: 'Scenario 1',
        facilitatorNote: '',
        clauses: [
          { id: uid(), type: 'Given', text: '' },
          { id: uid(), type: 'When', text: '' },
          { id: uid(), type: 'Then', text: '' },
        ],
      },
    ],
    initialSpec: [
      {
        id: uid(),
        prompt:
          'Write the rules you believe the system must follow, based on the requirements alone.',
        boxHeight: 2.5,
      },
    ],
  };
}

export function newRetrospectiveReport(): RetrospectiveReportModule {
  return {
    id: uid(),
    type: 'retrospective_report',
    title: 'Retrospective report',
    questions: [
      {
        id: uid(),
        text: 'Which scenario was hardest to translate into specification rules, and why?',
        boxHeight: 1.1,
      },
    ],
  };
}

export function newTaskWarmup(): TaskWarmupModule {
  return { id: uid(), type: 'task_warmup', ...newTaskContent() };
}

export function newTask(): TaskModule {
  return { id: uid(), type: 'task', ...newTaskContent() };
}

export function newModuleOfType(type: ModuleType): Module {
  switch (type) {
    case 'think_aloud_warmup':
      return newThinkAloudWarmup();
    case 'task_warmup':
      return newTaskWarmup();
    case 'task':
      return newTask();
    case 'retrospective_report':
      return newRetrospectiveReport();
  }
}

export const MODULE_TYPE_LABEL: Record<ModuleType, string> = {
  think_aloud_warmup: 'Think-aloud warmup',
  task_warmup: 'Task warmup',
  task: 'Task',
  retrospective_report: 'Retrospective report',
};

// Whether the participant's responses on this module are saved to the
// long-term DB (study_responses). Task warmups are practice-only and never
// persisted; everything else is. UI-only for V1 (the actual /study route
// will enforce on submit in V2).
export function isPersistedToDb(type: ModuleType): boolean {
  return type !== 'task_warmup';
}
