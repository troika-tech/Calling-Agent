import { format, formatDistanceToNow } from 'date-fns';

export const formatDuration = (seconds: number): string => {
  if (!seconds || seconds === 0) return '0s';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};

export const calculateDuration = (startedAt?: string, endedAt?: string): number | null => {
  if (!startedAt || !endedAt) return null;
  
  try {
    const start = new Date(startedAt).getTime();
    const end = new Date(endedAt).getTime();
    
    if (isNaN(start) || isNaN(end)) return null;
    
    return Math.floor((end - start) / 1000); // Return seconds
  } catch {
    return null;
  }
};

export const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return format(date, 'MMM dd, yyyy HH:mm');
  } catch (error) {
    return 'Invalid date';
  }
};

export const formatRelativeTime = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch (error) {
    return 'Invalid date';
  }
};

export const formatPhoneNumber = (phoneNumber: string): string => {
  // Remove all non-numeric characters
  const cleaned = phoneNumber.replace(/\D/g, '');

  // Format as +XX XXXXX XXXXX for Indian numbers
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`;
  }

  return phoneNumber;
};
