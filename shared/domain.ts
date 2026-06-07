export enum PracticeQuality {
  bad = 0,
  good = 1,
  perfect = 2,
}

export type TheoryItem = {
  question: string;
  answer: string;
};

export type PracticeSolution = {
  quality: keyof typeof PracticeQuality;
  solution: string;
};

export type PracticeItem = {
  task: string;
  description: string;
  solutions: PracticeSolution[];
};

export type Chapter = {
  id: string;
  number: number;
  name: string;
  theory: TheoryItem[];
  practice: PracticeItem[];
};

export type ChapterMeta = {
  id: string;
  number: number;
  name: string;
  theoryCount: number;
  practiceCount: number;
};

export type RawChapter = Omit<Chapter, "id"> & Partial<Pick<Chapter, "id">>;
