/**
 * Test script to verify Knowledge Base (KB) context retrieval
 *
 * Usage:
 *   node test-kb-retrieval.js <agentId> "<query>"
 *
 * Example:
 *   node test-kb-retrieval.js 6901dadc921a728c0e2e5fd9 "What are the product features?"
 */

require('dotenv').config({ path: '../../.env' });
const mongoose = require('mongoose');

// Increase buffer timeout
mongoose.set('bufferTimeoutMS', 30000);

const { ragService } = require('./backend/dist/services/rag.service');
const { embeddingsService } = require('./backend/dist/services/embeddings.service');
const { KnowledgeChunk } = require('./backend/dist/models/KnowledgeChunk');
const { KnowledgeBase } = require('./backend/dist/models/KnowledgeBase');

// ANSI colors for better output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

async function testKBRetrieval() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    log(colors.red, '\n❌ Missing arguments!');
    log(colors.yellow, '\nUsage:');
    log(colors.cyan, '  node test-kb-retrieval.js <agentId> "<query>"\n');
    log(colors.yellow, 'Example:');
    log(colors.cyan, '  node test-kb-retrieval.js 6901dadc921a728c0e2e5fd9 "What are the product features?"\n');
    process.exit(1);
  }

  const agentId = args[0];
  const query = args.slice(1).join(' ');

  try {
    log(colors.bright, '\n' + '='.repeat(80));
    log(colors.bright, '🔍 KNOWLEDGE BASE RETRIEVAL TEST');
    log(colors.bright, '='.repeat(80) + '\n');

    // Connect to MongoDB
    log(colors.cyan, '📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 30000,
    });
    log(colors.green, '✅ Connected to MongoDB\n');

    // Step 1: Check if agent exists and has KB documents
    log(colors.cyan, '📚 Checking Knowledge Base for agent:', agentId);
    const KBModel = KnowledgeBase.KnowledgeBase || KnowledgeBase;
    const documents = await KBModel.find({
      agentId: new mongoose.Types.ObjectId(agentId)
    });

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
    const KCModel = KnowledgeChunk.KnowledgeChunk || KnowledgeChunk;
    const totalChunks = await KCModel.countDocuments({
      agentId: new mongoose.Types.ObjectId(agentId),
      isActive: true
    });

    log(colors.cyan, `📊 Total active chunks in database: ${totalChunks}`);

    if (totalChunks === 0) {
      log(colors.red, '❌ No active chunks found');
      log(colors.yellow, '\nTip: Make sure documents are processed and chunks are created\n');
      process.exit(1);
    }
    console.log();

    // Step 3: Check if query is relevant
    log(colors.cyan, '🤔 Checking query relevance...');
    const isRelevant = ragService.ragService.isQueryRelevantForKB(query);
    log(colors.blue, `   Query: "${query}"`);
    log(isRelevant ? colors.green : colors.yellow, `   Is relevant: ${isRelevant ? 'Yes ✅' : 'No ⚠️'}`);

    if (!isRelevant) {
      log(colors.yellow, '\n⚠️ Warning: Query may be too conversational for KB search');
      log(colors.yellow, 'Continuing anyway for testing purposes...');
    }
    console.log();

    // Step 4: Generate embedding for query
    log(colors.cyan, '🧮 Generating embedding for query...');
    const startEmbed = Date.now();
    const { embedding: queryEmbedding } = await embeddingsService.embeddingsService.generateEmbedding(query);
    const embedTime = Date.now() - startEmbed;
    log(colors.green, `✅ Embedding generated (${queryEmbedding.length} dimensions) in ${embedTime}ms\n`);

    // Step 5: Test vector search with different configurations
    log(colors.bright, '🔎 VECTOR SEARCH TESTS\n');

    const testConfigs = [
      { name: 'Standard (topK=3, minScore=0.7)', topK: 3, minScore: 0.7 },
      { name: 'Relaxed (topK=5, minScore=0.5)', topK: 5, minScore: 0.5 },
      { name: 'Strict (topK=3, minScore=0.8)', topK: 3, minScore: 0.8 }
    ];

    for (const config of testConfigs) {
      log(colors.blue, `\n📍 Test: ${config.name}`);
      log(colors.blue, '-'.repeat(80));

      const startSearch = Date.now();
      const context = await ragService.ragService.queryKnowledgeBase(query, agentId, {
        topK: config.topK,
        minScore: config.minScore,
        maxContextLength: 3000
      });
      const searchTime = Date.now() - startSearch;

      if (context.chunks.length === 0) {
        log(colors.red, '❌ No chunks found matching criteria');
      } else {
        log(colors.green, `✅ Found ${context.chunks.length} chunk(s) in ${searchTime}ms`);
        log(colors.cyan, `   Max Score: ${context.maxScore.toFixed(4)}`);
        log(colors.cyan, `   Avg Score: ${context.avgScore.toFixed(4)}`);
        log(colors.cyan, `   Total Characters: ${context.chunks.reduce((sum, c) => sum + c.text.length, 0)}`);

        console.log();
        context.chunks.forEach((chunk, i) => {
          const source = chunk.metadata?.pageNumber
            ? `${chunk.fileName} (Page ${chunk.metadata.pageNumber})`
            : chunk.fileName;

          log(colors.yellow, `   [${i + 1}] ${source} - Score: ${chunk.score.toFixed(4)}`);
          log(colors.reset, `   "${chunk.text.substring(0, 150)}${chunk.text.length > 150 ? '...' : ''}"`);
          console.log();
        });
      }
    }

    // Step 6: Show formatted context for LLM
    log(colors.bright, '\n' + '='.repeat(80));
    log(colors.bright, '📝 FORMATTED CONTEXT FOR LLM');
    log(colors.bright, '='.repeat(80) + '\n');

    const context = await ragService.ragService.queryKnowledgeBase(query, agentId, {
      topK: 3,
      minScore: 0.7,
      maxContextLength: 2000  // Phone conversation limit
    });

    if (context.chunks.length > 0) {
      const formatted = ragService.ragService.formatContextForLLM(context);
      log(colors.cyan, formatted);
    } else {
      log(colors.red, '❌ No context available to format');
    }

    // Step 7: Test RAG statistics
    log(colors.bright, '\n' + '='.repeat(80));
    log(colors.bright, '📊 RAG STATISTICS');
    log(colors.bright, '='.repeat(80) + '\n');

    const stats = await ragService.ragService.getRAGStats(agentId);
    log(colors.green, `Total Documents: ${stats.totalDocuments}`);
    log(colors.green, `Total Chunks: ${stats.totalChunks}`);
    log(colors.green, `Ready Documents: ${stats.readyDocuments}`);
    log(colors.green, `Processing Documents: ${stats.processingDocuments}`);

    // Step 8: Sample direct vector search (low-level test)
    log(colors.bright, '\n' + '='.repeat(80));
    log(colors.bright, '🔬 LOW-LEVEL VECTOR SEARCH TEST');
    log(colors.bright, '='.repeat(80) + '\n');

    try {
      const directResults = await KCModel.vectorSearch(
        queryEmbedding,
        agentId,
        { limit: 3, minScore: 0.5 }
      );

      log(colors.green, `✅ Direct vector search returned ${directResults.length} results`);
      if (directResults.length > 0) {
        log(colors.cyan, `   Top score: ${directResults[0].score.toFixed(4)}`);
      }
    } catch (error) {
      log(colors.red, '❌ Direct vector search failed:', error.message);
      log(colors.yellow, '\n⚠️ This might indicate the vector index is not properly configured in MongoDB Atlas');
      log(colors.yellow, 'See: backend/src/models/KnowledgeChunk.ts (lines 121-136) for setup instructions');
    }

    log(colors.bright, '\n' + '='.repeat(80));
    log(colors.green, '✅ TEST COMPLETE');
    log(colors.bright, '='.repeat(80) + '\n');

  } catch (error) {
    log(colors.red, '\n❌ ERROR:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    log(colors.cyan, '\n📡 Disconnected from MongoDB\n');
  }
}

// Run the test
testKBRetrieval();
