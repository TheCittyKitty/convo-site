export const TOPICS = [
  'Tell a personal story involving bees.',
  'Tell a personal story involving a frying pan.',
  'Would you rather lose all your photos or all your text messages, and why?',
  'What is a tiny moment from your life that weirdly stuck with you?',
  'Tell a story about a time you were caught off guard by kindness.',
  'What is something ordinary that makes you feel strangely nostalgic?',
  'Tell a story involving rain, bad timing, and one other person.',
  'Would you rather be extremely lucky or extremely persuasive, and why?',
  'Tell a story about a meal you still remember for reasons beyond the food.',
  'What is a small rule you would add to society if everyone had to obey it?'
]

const TEN_MINUTES_MS = 10 * 60 * 1000

export function getTopicWindow(now = Date.now()) {
  return Math.floor(now / TEN_MINUTES_MS)
}

export function getTopicForNow(now = Date.now()) {
  const window = getTopicWindow(now)
  return TOPICS[window % TOPICS.length]
}

export function getTimeLeftMs(now = Date.now()) {
  return TEN_MINUTES_MS - (now % TEN_MINUTES_MS)
}
