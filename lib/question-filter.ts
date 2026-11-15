type TaggedQuestion = { type: string; relatedTopics?: readonly (string | undefined)[] };

type QuestionFilters<Question> = {
  unit: string;
  topic: string;
  type: string;
  unitForTopic: (topic: string | undefined) => string | undefined;
  topicsFor?: (question: Question) => readonly (string | undefined)[];
  include?: (question: Question) => boolean;
  search?: { query: string; text: (question: Question) => string };
};

export function filterQuestions<Question extends TaggedQuestion>(questions: readonly Question[], filters: QuestionFilters<Question>) {
  const { unit, topic, type, unitForTopic, topicsFor, include, search } = filters;
  const query = search?.query.toLowerCase();
  return questions.filter(question => {
    const related = topicsFor?.(question) ?? question.relatedTopics ?? [];
    return (!include || include(question))
      && (unit === "all" || related.some(id => unitForTopic(id) === unit))
      && (topic === "all" || related.includes(topic))
      && (type === "all" || question.type === type)
      && (!search || !query || search.text(question).toLowerCase().includes(query));
  });
}
