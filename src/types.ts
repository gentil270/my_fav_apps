export type NavView =
  | 'discover'
  | 'hub'
  | 'tv'
  | 'youtube'
  | 'pins'
  | 'ip'
  | 'radio'
  | 'drive';

export interface MediaCategoryDef {
  id: string;
  label: string;
  shortLabel: string;
  tvCategories: string[];
  youtubeQuery: string;
  musicGenre: string;
  radioTag: string;
}

export interface TrackItem {
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl: string;
  audioUrl: string;
  durationSec?: number;
  source: 'audius' | 'deezer' | 'itunes' | 'radio' | 'offline-radio' | 'drive' | 'spotify' | 'audiomack';
  genre?: string;
  country?: string;
  externalUrl?: string;
  embedUrl?: string;
  isLive?: boolean;
  offlineId?: string;
  driveFileId?: string;
}

export interface TVStreamSource {
  url: string;
  quality?: string;
  feed?: string;
  referrer?: string;
  userAgent?: string;
}

export interface TVChannel {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  category: string;
  mediaCategory: string;
  logo?: string;
  streamUrl: string;
  sources: TVStreamSource[];
  isNsfw?: boolean;
}

export interface YouTubeVideoItem {
  id: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationText?: string;
  viewsText?: string;
  publishedText?: string;
  category: string;
  country?: string;
  embedUrl: string;
}

export interface PinboardItem {
  id: string;
  title: string;
  artist: string;
  album?: string;
  source: 'spotify' | 'audiomack';
  genre: string;
  coverUrl: string;
  audioUrl: string;
  externalUrl: string;
  embedUrl: string;
  aspectRatio: 'square' | 'portrait' | 'tall';
  durationSec?: number;
}

export interface RadioStation {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  tags: string[];
  codec?: string;
  bitrate?: number;
  favicon?: string;
  streamUrl: string;
  homepage?: string;
  votes?: number;
  isMix?: boolean;
  durationSec?: number;
}

export interface OfflineRadioClip {
  id: string;
  stationId: string;
  title: string;
  subtitle: string;
  country: string;
  tags: string[];
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  createdAt: number;
  coverUrl?: string;
  isMix?: boolean;
  blob?: Blob;
}

export interface IpContextInfo {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  timezone: string;
  isp: string;
  asn: string;
}

export interface UserInterestsProfile {
  categories: string[];
  genres: string[];
  topics: string[];
}

export interface DriveMediaFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  iconLink?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  parents?: string[];
  ownedByMe?: boolean;
  capabilities?: {
    canEdit?: boolean;
    canDelete?: boolean;
    canRename?: boolean;
  };
}

export interface PlaylistItem {
  id: string;
  name: string;
  createdAt: number;
  tracks: TrackItem[];
}
