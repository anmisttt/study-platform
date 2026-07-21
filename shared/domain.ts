export type TheoryItem = {
  question: string;
  answer: string;
};

export type PracticeItem = {
  task: string;
  question: string;
  answer: string;
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
