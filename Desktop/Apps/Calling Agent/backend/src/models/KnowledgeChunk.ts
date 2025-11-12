import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * KnowledgeChunk - Individual chunk with embedding
 * Each chunk is a separate document to support MongoDB Atlas Vector Search
 * (Vector fields can only appear once per document)
 */

export interface IKnowledgeChunk extends Document {
  // Reference to parent document
  documentId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;

  // Document info
  fileName: string;
  fileType: 'pdf' | 'docx' | 'txt';

  // Chunk data
  text: string;
  embedding: number[];  // 1536 dimensions for text-embedding-3-small
  chunkIndex: number;

  // Metadata
  metadata: {
    pageNumber?: number;
    section?: string;
    startChar?: number;
    endChar?: number;
  };

  // Status
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

// Model interface with statics
export interface IKnowledgeChunkModel extends Model<IKnowledgeChunk> {
  vectorSearch(
    queryEmbedding: number[],
    agentId: string,
    options?: {
      limit?: number;
      minScore?: number;
      filter?: any;
    }
  ): Promise<any[]>;
}

const knowledgeChunkSchema = new Schema<IKnowledgeChunk>(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'KnowledgeBase',
      required: true,
      index: true
    },
    agentId: {
      type: Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    fileName: {
      type: String,
      required: true
    },
    fileType: {
      type: String,
      required: true,
      enum: ['pdf', 'docx', 'txt']
    },
    text: {
      type: String,
      required: true
    },
    embedding: {
      type: [Number],
      required: true,
      validate: {
        validator: function(v: number[]) {
          return v.length === 1536;
        },
        message: 'Embedding must have exactly 1536 dimensions'
      }
    },
    chunkIndex: {
      type: Number,
      required: true
    },
    metadata: {
      pageNumber: Number,
      section: String,
      startChar: Number,
      endChar: Number
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for efficient queries
knowledgeChunkSchema.index({ documentId: 1, chunkIndex: 1 });
knowledgeChunkSchema.index({ agentId: 1, isActive: 1 });
knowledgeChunkSchema.index({ userId: 1, createdAt: -1 });

// CRITICAL: Vector Search Index
// This must be created in MongoDB Atlas UI (Search tab)
// Index name: 'vector_index_chunks'
// Collection: 'knowledgechunks'
//
// MongoDB Atlas Vector Search Index Configuration:
// {
//   "fields": [{
//     "type": "vector",
//     "path": "embedding",
//     "numDimensions": 1536,
//     "similarity": "cosine"
//   }]
// }
//
// IMPORTANT: Now embedding is a direct field (not in an array), so this will work!

// Static method for vector search
knowledgeChunkSchema.statics.vectorSearch = async function(
  queryEmbedding: number[],
  agentId: string,
  options?: {
    limit?: number;
    minScore?: number;
    filter?: any;
  }
) {
  const limit = options?.limit || 5;
  const minScore = options?.minScore || 0.7;

  // MongoDB Atlas Vector Search aggregation pipeline
  const pipeline: any[] = [
    {
      $vectorSearch: {
        index: 'knowledgechunks',  // Must match index name in Atlas
        path: 'embedding',
        queryVector: queryEmbedding,
        numCandidates: limit * 10,
        limit: limit,
        filter: {
          agentId: new mongoose.Types.ObjectId(agentId),
          isActive: true,
          ...options?.filter
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
        score: { $gte: minScore }
      }
    },
    {
      $project: {
        _id: 1,
        documentId: 1,
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
    },
    {
      $limit: limit
    }
  ];

  return await this.aggregate(pipeline);
};

export const KnowledgeChunk = mongoose.model<IKnowledgeChunk, IKnowledgeChunkModel>('KnowledgeChunk', knowledgeChunkSchema);
