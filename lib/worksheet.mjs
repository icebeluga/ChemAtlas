// A source page used as a fallback already includes every stimulus on that page.
export function planWorksheet(questions, stimuli, originalPagesFor) {
  const fullPages = new Set();
  const keyFor = (question, page) => `${question.sourceBank || "mega"}:${page}`;
  for (const question of questions) {
    for (const page of originalPagesFor(question)) {
      if (!question.sourceRegions?.some(region => region.page === page)) {
        fullPages.add(keyFor(question, page));
      }
    }
  }

  const usedStimuli = new Set();
  const usedFullPages = new Set();
  return questions.map(question => {
    const segments = [];
    for (const stimulusId of question.stimulusIds ?? []) {
      const stimulus = stimuli[stimulusId];
      if (!stimulus || usedStimuli.has(stimulusId)) continue;
      usedStimuli.add(stimulusId);
      for (const region of stimulus.regions) {
        if (!fullPages.has(keyFor(question, region.page))) {
          segments.push({ page: region.page, regions: [region], stimulusId });
        }
      }
    }
    for (const page of originalPagesFor(question)) {
      const key = keyFor(question, page);
      if (fullPages.has(key)) {
        if (!usedFullPages.has(key)) segments.push({ page, regions: [] });
        usedFullPages.add(key);
      } else {
        segments.push({ page, regions: question.sourceRegions.filter(region => region.page === page) });
      }
    }
    return { question, segments };
  });
}
