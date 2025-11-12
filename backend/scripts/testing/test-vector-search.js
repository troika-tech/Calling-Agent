/**
 * Test vector search directly to debug issues
 */

require('dotenv').config({ path: '../../.env' });
const { MongoClient, ObjectId } = require('mongodb');
const { embeddingsService } = require('./backend/dist/services/embeddings.service');

async function testVectorSearch() {
  const agentId = process.argv[2] || '6901dadc921a728c0e2e5fd9';
  const query = process.argv.slice(3).join(' ') || 'What is WhatsApp?';

  let client;

  try {
    console.log('\n🔍 Testing Vector Search\n');
    console.log('Agent ID:', agentId);
    console.log('Query:', query);
    console.log();

    // Connect
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db();

    // Generate embedding
    console.log('📊 Generating embedding...');
    const embeddingsSvc = embeddingsService.embeddingsService || embeddingsService;
    const { embedding: queryEmbedding } = await embeddingsSvc.generateEmbedding(query);
    console.log('✅ Embedding generated:', queryEmbedding.length, 'dimensions\n');

    // Test 1: Vector search WITHOUT score filter
    console.log('Test 1: Vector search WITHOUT score filter (get top 5)');
    console.log('─'.repeat(60));

    const pipeline1 = [
      {
        $vectorSearch: {
          index: 'knowledgechunks',  // Actual index name in Atlas
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: 100,
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
        $project: {
          fileName: 1,
          text: 1,
          score: 1
        }
      }
    ];

    try {
      const results1 = await db.collection('knowledgechunks')
        .aggregate(pipeline1)
        .toArray();

      if (results1.length === 0) {
        console.log('❌ No results returned');
        console.log('\n⚠️ This suggests the vector index might not be configured correctly in MongoDB Atlas');
      } else {
        console.log(`✅ Found ${results1.length} results\n`);
        results1.forEach((r, i) => {
          console.log(`${i + 1}. Score: ${r.score.toFixed(4)} - ${r.fileName}`);
          console.log(`   Text: "${r.text.substring(0, 100)}..."\n`);
        });
      }
    } catch (error) {
      console.error('❌ Vector search error:', error.message);
      if (error.message.includes('index') || error.message.includes('$vectorSearch')) {
        console.log('\n⚠️ Vector index is NOT configured properly!');
        console.log('\nTo fix:');
        console.log('1. Go to MongoDB Atlas → Database → Search Indexes');
        console.log('2. Create Search Index on "knowledgechunks" collection');
        console.log('3. Index name: vector_index_chunks');
        console.log('4. Configuration:');
        console.log(JSON.stringify({
          fields: [{
            type: 'vector',
            path: 'embedding',
            numDimensions: 1536,
            similarity: 'cosine'
          }]
        }, null, 2));
      }
    }

    // Test 2: Try with lower threshold
    console.log('\n\nTest 2: Vector search WITH score filter >= 0.5');
    console.log('─'.repeat(60));

    const pipeline2 = [
      {
        $vectorSearch: {
          index: 'knowledgechunks',  // Actual index name in Atlas
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: 100,
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
          score: { $gte: 0.5 }
        }
      },
      {
        $project: {
          fileName: 1,
          text: 1,
          score: 1
        }
      }
    ];

    try {
      const results2 = await db.collection('knowledgechunks')
        .aggregate(pipeline2)
        .toArray();

      if (results2.length === 0) {
        console.log('❌ No results with score >= 0.5');
        console.log('This means all chunks have similarity scores < 0.5');
        console.log('Try a query that better matches your document content');
      } else {
        console.log(`✅ Found ${results2.length} results with score >= 0.5\n`);
        results2.forEach((r, i) => {
          console.log(`${i + 1}. Score: ${r.score.toFixed(4)} - ${r.fileName}`);
          console.log(`   Text: "${r.text.substring(0, 100)}..."\n`);
        });
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }

    // Test 3: Show sample chunk texts
    console.log('\n\nTest 3: Sample chunks from knowledge base');
    console.log('─'.repeat(60));

    const samples = await db.collection('knowledgechunks')
      .find({
        agentId: new ObjectId(agentId),
        isActive: true
      })
      .limit(3)
      .toArray();

    console.log(`Showing ${samples.length} sample chunks:\n`);
    samples.forEach((s, i) => {
      console.log(`${i + 1}. ${s.fileName} (chunk ${s.chunkIndex})`);
      console.log(`   "${s.text.substring(0, 150)}..."\n`);
    });

    console.log('\n✅ Test complete\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

testVectorSearch();
