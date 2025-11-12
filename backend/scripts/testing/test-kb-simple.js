/**
 * Simple KB retrieval test using native MongoDB driver
 *
 * Usage:
 *   node test-kb-simple.js <agentId> "<query>"
 *
 * Example:
 *   node test-kb-simple.js 6901dadc921a728c0e2e5fd9 "What are the product features?"
 */

require('dotenv').config({ path: '../../.env' });
const { MongoClient, ObjectId } = require('mongodb');
const { embeddingsService } = require('./backend/dist/services/embeddings.service');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

async function testKBRetrieval() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    log(colors.red, '\n❌ Missing arguments!');
    log(colors.yellow, '\nUsage:');
    log(colors.cyan, '  node test-kb-simple.js <agentId> "<query>"\n');
    log(colors.yellow, 'Example:');
    log(colors.cyan, '  node test-kb-simple.js 6901dadc921a728c0e2e5fd9 "What are the product features?"\n');
    process.exit(1);
  }

  const agentId = args[0];
  const query = args.slice(1).join(' ');
  let client;

  try {
    log(colors.bright, '\n' + '='.repeat(80));
    log(colors.bright, '🔍 KNOWLEDGE BASE RETRIEVAL TEST');
    log(colors.bright, '='.repeat(80) + '\n');

    // Connect to MongoDB
    log(colors.cyan, '📡 Connecting to MongoDB...');
    client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 30000,
    });
    await client.connect();
    log(colors.green, '✅ Connected to MongoDB\n');

    const db = client.db();

    // Step 1: Check KB documents
    log(colors.cyan, '📚 Checking Knowledge Base for agent:', agentId);
    const documents = await db.collection('knowledgebases')
      .find({ agentId: new ObjectId(agentId) })
      .toArray();

    if (documents.length === 0) {
      log(colors.red, '❌ No knowledge base documents found for this agent');
      log(colors.yellow, '\nTip: Upload documents to the agent\'s knowledge base first\n');
      process.exit(1);
    }

    log(colors.green, `✅ Found ${documents.length} document(s) in knowledge base:`);
    documents.forEach((doc, i) => {
      log(colors.blue, `   ${i + 1}. ${doc.fileName} (${doc.status}) - ${doc.totalChunks} chunks`);
    });
    console.log();

    // Step 2: Check total chunks
    const totalChunks = await db.collection('knowledgechunks')
      .countDocuments({
        agentId: new ObjectId(agentId),
        isActive: true
      });

    log(colors.cyan, `📊 Total active chunks in database: ${totalChunks}`);

    if (totalChunks === 0) {
      log(colors.red, '❌ No active chunks found');
      log(colors.yellow, '\nTip: Make sure documents are processed and chunks are created\n');
      process.exit(1);
    }
    console.log();

    // Step 3: Generate embedding
    log(colors.cyan, '🧮 Generating embedding for query...');
    log(colors.blue, `   Query: "${query}"`);
    const startEmbed = Date.now();
    const embeddingsSvc = embeddingsService.embeddingsService || embeddingsService;
    const { embedding: queryEmbedding } = await embeddingsSvc.generateEmbedding(query);
    const embedTime = Date.now() - startEmbed;
    log(colors.green, `✅ Embedding generated (${queryEmbedding.length} dimensions) in ${embedTime}ms\n`);

    // Step 4: Vector search
    log(colors.bright, '🔎 VECTOR SEARCH TEST\n');
    log(colors.blue, 'Standard Configuration (topK=5, minScore=0.7)');
    log(colors.blue, '-'.repeat(80));

    const startSearch = Date.now();
    const pipeline = [
      {
        $vectorSearch: {
          index: 'knowledgechunks',  // Actual index name in Atlas
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: 50,
          limit: 5,
          filter: {
            agentId: new ObjectId(agentId),
            isActive: true
          }
        }
      },
      {
        $addFields: {
          score: { $meta: 'vectorSearchScore' }
        }
      },
      {
        $match: {
          score: { $gte: 0.7 }
        }
      },
      {
        $project: {
          _id: 1,
          fileName: 1,
          fileType: 1,
          text: 1,
          chunkIndex: 1,
          metadata: 1,
          score: 1
        }
      },
      {
        $sort: { score: -1 }
      }
    ];

    const results = await db.collection('knowledgechunks')
      .aggregate(pipeline)
      .toArray();

    const searchTime = Date.now() - startSearch;

    if (results.length === 0) {
      log(colors.red, '❌ No chunks found matching criteria (minScore >= 0.7)');
      log(colors.yellow, '\n⚠️  This usually means:');
      log(colors.yellow, '   1. Vector index is NOT configured in MongoDB Atlas');
      log(colors.yellow, '   2. Or query doesn\'t match document content well');
      log(colors.cyan, '\n📖 To fix the vector index issue:');
      log(colors.cyan, '   See: FIX_VECTOR_INDEX.md or VECTOR_INDEX_QUICK_GUIDE.md');
      log(colors.cyan, '\n🧪 To test if vector index exists:');
      log(colors.cyan, '   node test-vector-search.js <agentId> "<query>"\n');
    } else {
      const maxScore = Math.max(...results.map(r => r.score));
      const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
      const totalChars = results.reduce((sum, r) => sum + r.text.length, 0);

      log(colors.green, `✅ Found ${results.length} chunk(s) in ${searchTime}ms`);
      log(colors.cyan, `   Max Score: ${maxScore.toFixed(4)}`);
      log(colors.cyan, `   Avg Score: ${avgScore.toFixed(4)}`);
      log(colors.cyan, `   Total Characters: ${totalChars}`);

      console.log();
      results.forEach((chunk, i) => {
        const source = chunk.metadata?.pageNumber
          ? `${chunk.fileName} (Page ${chunk.metadata.pageNumber})`
          : chunk.fileName;

        log(colors.yellow, `   [${i + 1}] ${source} - Score: ${chunk.score.toFixed(4)}`);
        log(colors.reset, `   "${chunk.text.substring(0, 150)}${chunk.text.length > 150 ? '...' : ''}"`);
        console.log();
      });

      // Show formatted context
      log(colors.bright, '='.repeat(80));
      log(colors.bright, '📝 FORMATTED CONTEXT FOR LLM');
      log(colors.bright, '='.repeat(80) + '\n');

      log(colors.cyan, '# Knowledge Base Information\n');
      results.forEach((chunk, i) => {
        const source = chunk.metadata?.pageNumber
          ? `${chunk.fileName} (Page ${chunk.metadata.pageNumber})`
          : chunk.fileName;

        log(colors.yellow, `[${i + 1}] Source: ${source}`);
        log(colors.reset, chunk.text);
        console.log();
      });
    }

    log(colors.bright, '='.repeat(80));
    log(colors.green, '✅ TEST COMPLETE');
    log(colors.bright, '='.repeat(80) + '\n');

  } catch (error) {
    log(colors.red, '\n❌ ERROR:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      log(colors.cyan, '\n📡 Disconnected from MongoDB\n');
    }
  }
}

testKBRetrieval();
