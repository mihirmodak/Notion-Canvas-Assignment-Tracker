const {Client} = require("@notionhq/client")
const tweets = require("./tweets.json")
const customenv = require("custom-env").env("demo")

const notion = new Client({ auth: process.env.NOTION_KEY })

const databaseId = process.env.NOTION_DATABASE_ID

async function main() {
  // 1. Add all tweets to feedback database.
  const pagesToCreate = convertTweetsToCreatePageOperations(tweets)
  await createPages(pagesToCreate)

  // 2. Get options from database schema for tagging.
  const options = await getDatabaseTagOptions()

  // 3. Get existing pages in the database.
  const pagesWithFeedback = await queryDatabase()

  // 4. Match pages with tags and update.
  const pagesToUpdate = convertFeedbackToTags(pagesWithFeedback, options)
  await updatePages(pagesToUpdate)

  // 5. Celebrate!
  logger({ wooo: "WOOO!" })
}

//*========================================================================
// Requests
//*========================================================================

/**
 * Adds pages to our feedback database
 *
 * @param pagesToCreate: Array<{ feedback: string, url: string }>
 */
async function createPages(pagesToCreate) {
  const isEmpty = await shouldCreateNewTweets()
  if (!isEmpty) {
    return
  }
  // https://developers.notion.com/reference/post-page
  await Promise.all(
    pagesToCreate.map(({ feedback, url }) =>
      notion.pages.create({
        parent: { database_id: databaseId },
        properties: {
          Feedback: {
            title: [{ type: "text", text: { content: feedback } }],
          },
          URL: { url },
        },
      })
    )
  )
}

/**
 * Get feedback Tags
 *
 * Returns array of multi-select options
 * Array<{ id: string, name: string, color: string }>
 */
async function getDatabaseTagOptions() {
  // https://developers.notion.com/reference/get-database
  const databaseResponse = await notion.databases.retrieve({
    database_id: databaseId,
  })
  const tagProperty = databaseResponse.properties["Tags"]
  return tagProperty.multi_select.options
}

/**
 * Query the Twitter feedback database
 *
 * Returns array of objects with pageId and feedback property
 * Array<{ pageId: string, feedback: string }>
 */
async function queryDatabase() {
  // https://developers.notion.com/reference/post-database-query
  let pages = []
  let cursor = undefined
  while (true) {
    const { results, next_cursor } = await notion.databases.query({
      database_id: databaseId,
      filter: { property: "Tags", multi_select: { is_empty: true } },
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: 10,
      start_cursor: cursor,
    })
    pages.push(...results)
    if (!next_cursor) {
      break
    }
    cursor = next_cursor
  }
  return pages.map(page => {
    const titleProperty = page.properties["Feedback"]
    const richText = titleProperty.title
    const feedback = richText.map(({ plain_text }) => plain_text).join("")
    return { pageId: page.id, feedback }
  })
}

/**
 * Updates provided pages with tags
 *
 * @param pagesToUpdate: Array<{ pageId: string, tags: Array<{ id: string } | { name: string }> }>
 */
async function updatePages(pagesToUpdate) {
  // https://developers.notion.com/reference/patch-page
  await Promise.all(
    pagesToUpdate.map(({ pageId, tags }) =>
      notion.pages.update({
        page_id: pageId,
        properties: {
          Tags: {
            multi_select: tags,
          },
        },
      })
    )
  )
}

//*========================================================================
// Helpers
//*========================================================================

/**
 * Returns true if our DB is empty
 * Prevents duplication during glitch refreshes
 */
async function shouldCreateNewTweets() {
  const { results } = await notion.databases.query({
    database_id: databaseId,
  })
  return results.length === 0
}

/**
 * Returns fields needed to create new pages in the feedback database.
 * Array<{ feedback: string, url: string }>
 */
function convertTweetsToCreatePageOperations(tweets) {
  return tweets.map(tweet => {
    const [{ expanded_url }] = tweet.entities.urls
    console.log({ feedback: tweet.text, url: expanded_url })
    return { feedback: tweet.text, url: expanded_url }
  })
}

/**
 * Scans the tweet text for option name using basic regex.
 * Filters out any pages that are already tagged.
 *
 *
 * @param pagesWithFeedback: Array<{ pageId: string, feedback: string }>
 * @param options: Array<{ id: string, name: string, color: string }>
 *
 * Returns fields needed to update existing pages with matching tags
 * Array<{ pageId: string, tags: Array<{ id: string, name: string, color: string }> }>
 */
function convertFeedbackToTags(pagesWithFeedback, options) {
  const defaultTag = options.find(({ name }) => name === "API")
  return pagesWithFeedback
    .map(({ pageId, feedback }) => {
      const tags = []
      for (const option of options) {
        const regex = new RegExp(`${option.name}s?`, "i")
        if (feedback.match(regex)) {
          tags.push(option)
        }
      }
      if (defaultTag && tags.length === 0) {
        tags.push(defaultTag)
      }
      return { pageId, tags }
    })
    .filter(result => result)
}

/**
 * Stringify objects when logging
 */
function logger(variableObject) {
  const variableName = Object.keys(variableObject)[0]
  console.log(
    `${variableName}:`,
    JSON.stringify(variableObject[variableName], null, 2)
  )
}

// main()
convertTweetsToCreatePageOperations(tweets)