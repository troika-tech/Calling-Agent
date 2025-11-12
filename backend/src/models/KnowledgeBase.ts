import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IKnowledgeBase extends Document {
  agentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  fileName: string;
  fileType: 'pdf' | 'docx' | 'txt';
  fileSize: number;  // In bytes
  uploadedAt: Date;

  // Processing status
  status: 'processing' | 'ready' | 'failed';
  processingError?: string;
  error?: string;  // For backward compatibility
  processedAt?: Date;
  processingMetadata?: {
    duration: number;
    cost: number;
    chunkingMethod: string;
    embeddingModel: string;
  };

  // Stats (chunks are now in separate collection: KnowledgeChunk)
  totalChunks: number;
  totalTokens: number;
  totalCharacters: number;

  // Metadata
  description?: string;
  tags?: string[];
  isActive: boolean;
  deletedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

// Model interface with statics
const knowledgeBaseSchema = new Schema<IKnowledgeBase>(
  {
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
      required: true,
      trim: true
    },
    fileType: {
      type: String,
      required: true,
      enum: ['pdf', 'docx', 'txt']
    },
    fileSize: {
      type: Number,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      required: true,
      enum: ['processing', 'ready', 'failed'],
      default: 'processing',
      index: true
    },
    processingError: String,
    error: String,  // For backward compatibility
    processedAt: Date,
    processingMetadata: {
      duration: Number,
      cost: Number,
      chunkingMethod: String,
      embeddingModel: String
    },
    totalChunks: {
      type: Number,
      default: 0
    },
    totalTokens: {
      type: Number,
      default: 0
    },
    totalCharacters: {
      type: Number,
      default: 0
    },
    description: String,
    tags: [String],
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    deletedAt: Date
  },
  {
    timestamps: true
  }
);

// Indexes for efficient queries
knowledgeBaseSchema.index({ agentId: 1, isActive: 1, status: 1 });
knowledgeBaseSchema.index({ userId: 1, createdAt: -1 });
knowledgeBaseSchema.index({ fileName: 'text', description: 'text' });

// NOTE: Vector search is now handled by KnowledgeChunk model
// Each chunk is a separate document with its own embedding
// See KnowledgeChunk.ts for vector search implementation

// Virtual for file size in MB
knowledgeBaseSchema.virtual('fileSizeMB').get(function() {
  return (this.fileSize / (1024 * 1024)).toFixed(2);
});

// Method to mark as processed
knowledgeBaseSchema.methods.markAsReady = async function() {
  this.status = 'ready';
  // Note: totalChunks and totalCharacters are set by the processing function
  return await this.save();
};

// Method to mark as failed
knowledgeBaseSchema.methods.markAsFailed = async function(error: string) {
  this.status = 'failed';
  this.processingError = error;
  return await this.save();
};

export const KnowledgeBase = mongoose.model<IKnowledgeBase>('KnowledgeBase', knowledgeBaseSchema);
