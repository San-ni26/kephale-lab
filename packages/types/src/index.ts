// ─── User & Auth ───────────────────────────────────────────────────────────────

export type UserRole = 'LISTENER' | 'PREMIUM' | 'PREMIUM_PLUS' | 'ARTIST' | 'ADMIN';

export interface User {
  id: string;
  googleId?: string;
  email: string;
  name: string;
  username: string;
  avatar?: string;
  phoneNumber?: string;
  role: UserRole;
  tokenBalance: number;
  createdAt: string;
  artistProfile?: ArtistProfile;
  subscription?: Subscription;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ─── Artist ─────────────────────────────────────────────────────────────────────

export interface ArtistProfile {
  id: string;
  userId: string;
  stageName: string;
  bio?: string;
  avatar?: string;
  coverImage?: string;
  genre: string[];
  country: string;
  websiteUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  stripeAccountId?: string;
  isVerified: boolean;
  isActive: boolean;
  totalEarnings: number;
  pendingPayout: number;
  totalPlays: number;
  totalViews: number;
  totalFollowers: number;
  createdAt: string;
  _count?: {
    followers: number;
    tracks: number;
    videos: number;
    albums: number;
  };
}

export interface ArtistStats {
  followersCount: number;
  tracksCount: number;
  videosCount: number;
  albumsCount: number;
  totalPlays: number;
  totalViews: number;
}

export interface ArtistDashboard {
  artist: ArtistProfile;
  stats: {
    totalFollowers: number;
    totalTracks: number;
    totalVideos: number;
    totalAlbums: number;
    totalPlays: number;
    totalViews: number;
    totalRevenue: number;
    pendingPayout: number;
    totalEarnings: number;
  };
  recentPurchases: Purchase[];
  topTracks: Pick<Track, 'id' | 'title' | 'coverUrl' | 'plays' | 'price'>[];
  recentUploads: {
    tracks: Pick<Track, 'id' | 'title' | 'coverUrl' | 'status' | 'plays' | 'createdAt'>[];
    videos: Pick<Video, 'id' | 'title' | 'thumbnailUrl' | 'type' | 'status' | 'views' | 'createdAt'>[];
  };
}

// ─── Albums ──────────────────────────────────────────────────────────────────────

export type AlbumStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

export interface Album {
  id: string;
  artistId: string;
  artist?: Pick<ArtistProfile, 'id' | 'stageName' | 'avatar' | 'isVerified'>;
  title: string;
  description?: string;
  coverUrl: string;
  price: number;
  currency: string;
  status: AlbumStatus;
  releaseDate?: string;
  createdAt: string;
  tracks?: Track[];
  _count?: {
    tracks: number;
    purchases: number;
  };
}

// ─── Music ───────────────────────────────────────────────────────────────────────

export type TrackStatus = 'PROCESSING' | 'ACTIVE' | 'INACTIVE';

export interface Track {
  id: string;
  artistId: string;
  artist?: Pick<ArtistProfile, 'id' | 'stageName' | 'avatar' | 'isVerified'>;
  albumId?: string;
  album?: Pick<Album, 'id' | 'title' | 'coverUrl'>;
  title: string;
  duration: number; // seconds
  coverUrl: string;
  audioUrl: string; // HLS master playlist URL
  price: number;    // 0 = free
  currency: string;
  genre: string[];
  plays: number;
  status: TrackStatus;
  isExplicit: boolean;
  s3Key?: string;
  releaseDate?: string;
  createdAt: string;
  _count?: {
    likes: number;
    purchases: number;
  };
}

export interface Playlist {
  id: string;
  artistId?: string;
  userId?: string;
  title: string;
  description?: string;
  coverUrl?: string;
  isPublic: boolean;
  tracks?: Track[];
  _count?: { items: number };
  createdAt: string;
}

// ─── Video ───────────────────────────────────────────────────────────────────────

export type VideoType = 'CLIP' | 'SHORT';
export type VideoStatus = 'PROCESSING' | 'ACTIVE' | 'INACTIVE';

export interface Video {
  id: string;
  artistId: string;
  artist?: Pick<ArtistProfile, 'id' | 'stageName' | 'avatar' | 'isVerified'>;
  title: string;
  description?: string;
  type: VideoType;
  thumbnailUrl: string;
  videoUrl: string; // HLS URL
  duration: number;
  views: number;
  price: number;
  currency: string;
  status: VideoStatus;
  isExplicit: boolean;
  createdAt: string;
  _count?: {
    likes: number;
    comments: number;
  };
}

// ─── Post / Feed ─────────────────────────────────────────────────────────────────

export type PostType = 'TRACK' | 'CLIP' | 'SHORT' | 'TEXT' | 'IMAGE';

export interface Post {
  id: string;
  artistId: string;
  artist: Pick<ArtistProfile, 'id' | 'stageName' | 'avatar' | 'isVerified'>;
  type: PostType;
  content?: string;
  mediaUrl?: string;
  track?: Track;
  video?: Video;
  _count?: { likes: number; comments: number };
  isLiked?: boolean;
  createdAt: string;
}

export interface Comment {
  id: string;
  postId?: string;
  videoId?: string;
  userId: string;
  user: Pick<User, 'id' | 'name' | 'avatar'>;
  content: string;
  createdAt: string;
}

// ─── Live ─────────────────────────────────────────────────────────────────────────

export type LiveStatus = 'SCHEDULED' | 'LIVE' | 'ENDED';

export interface Live {
  id: string;
  artistId: string;
  artist: Pick<ArtistProfile, 'id' | 'stageName' | 'avatar'>;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  roomId: string;         // LiveKit room name
  status: LiveStatus;
  viewerCount: number;
  viewerPeak: number;
  totalDonations: number; // in tokens
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  recordingUrl?: string;
}

export interface LiveToken {
  token: string;   // LiveKit JWT token
  serverUrl: string;
  roomName: string;
}

// ─── Donations & Tokens ──────────────────────────────────────────────────────────

export interface TokenPack {
  id: string;
  tokens: number;
  priceEur: number;
  label: string;
  isBestValue: boolean;
}

export interface Donation {
  id: string;
  liveId: string;
  fromUserId: string;
  fromUser: Pick<User, 'id' | 'name' | 'avatar'>;
  tokens: number;
  message?: string;
  createdAt: string;
}

export interface DiscussionRequest {
  id: string;
  liveId: string;
  fromUserId: string;
  fromUser: Pick<User, 'id' | 'name' | 'avatar'>;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'ENDED';
  createdAt: string;
}

// ─── Monetization ─────────────────────────────────────────────────────────────────

export type SubscriptionTier = 'FREE' | 'PREMIUM' | 'PREMIUM_PLUS';
export type SubscriptionStatus = 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'TRIALING';

export interface Subscription {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  stripeSubscriptionId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
}

export interface Purchase {
  id: string;
  userId: string;
  type: 'TRACK' | 'CLIP' | 'ALBUM' | 'TOKEN_PACK' | 'SUBSCRIPTION';
  trackId?: string;
  track?: Pick<Track, 'id' | 'title' | 'coverUrl'>;
  videoId?: string;
  albumId?: string;
  album?: Pick<Album, 'id' | 'title' | 'coverUrl'>;
  amount: number;
  currency: string;
  platformFeeAmount: number;
  artistAmount: number;
  status: string;
  createdAt: string;
  user?: Pick<User, 'id' | 'name' | 'avatar'>;
}

// ─── Currency & Pricing ────────────────────────────────────────────────────────────

export type SupportedCurrency =
  | 'XOF'
  | 'XAF'
  | 'EUR'
  | 'USD'
  | 'GNF'
  | 'CDF'
  | 'CAD'
  | 'GBP'
  | 'NGN'
  | 'KES'
  | 'GHS'
  | 'ZAR'
  | 'RWF';


// ─── Offline & Downloads ───────────────────────────────────────────────────────────

export type DownloadStatus = 'PENDING' | 'DOWNLOADING' | 'COMPLETE' | 'FAILED' | 'EXPIRED';

export interface OfflineTrack {
  trackId: string;
  filePath: string;
  encryptionKeyRef: string;
  licenseExpiresAt: string;
  downloadedAt: string;
  status: DownloadStatus;
  fileSize: number;
}

// ─── API Responses ─────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

// ─── Socket Events ────────────────────────────────────────────────────────────────

export interface LiveChatMessage {
  id: string;
  liveId: string;
  userId: string;
  user: Pick<User, 'id' | 'name' | 'avatar'>;
  message: string;
  timestamp: string;
}

export type SocketEvents = {
  // Client → Server
  'live:join': (liveId: string) => void;
  'live:leave': (liveId: string) => void;
  'live:chat': (payload: { liveId: string; message: string }) => void;
  'live:donate': (payload: { liveId: string; tokens: number; message?: string }) => void;
  'live:request_discussion': (liveId: string) => void;
  'live:accept_discussion': (requestId: string) => void;
  'live:reject_discussion': (requestId: string) => void;

  // Server → Client
  'live:chat_message': (msg: LiveChatMessage) => void;
  'live:donation': (donation: Donation) => void;
  'live:viewer_count': (payload: { liveId: string; count: number }) => void;
  'live:discussion_request': (request: DiscussionRequest) => void;
  'live:discussion_accepted': (payload: { requestId: string; liveToken: LiveToken }) => void;
  'live:ended': (liveId: string) => void;
  'notification': (payload: { type: string; title: string; body: string; data?: unknown }) => void;
};

// ─── Ad Server & Régie Publicitaire & Boosts ────────────────────────────────

export type AdPlacement = 'REEL' | 'CLIP_PREROLL' | 'BANNER' | 'AUDIO_SPOT' | 'TRACK_BOOST' | 'ALBUM_BOOST';
export type AdStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export interface Advertiser {
  id: string;
  name: string;
  company?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  campaigns?: AdCampaign[];
  createdAt: string;
  updatedAt: string;
  _count?: {
    campaigns: number;
  };
}

export interface AdCampaign {
  id: string;
  advertiserId?: string | null;
  advertiser?: Advertiser | null;
  userId?: string | null;
  user?: Pick<User, 'id' | 'name' | 'avatar' | 'username'> | null;
  trackId?: string | null;
  track?: Pick<Track, 'id' | 'title' | 'coverUrl' | 'audioUrl'> | null;
  albumId?: string | null;
  album?: Pick<Album, 'id' | 'title' | 'coverUrl'> | null;
  videoId?: string | null;
  video?: Pick<Video, 'id' | 'title' | 'thumbnailUrl' | 'videoUrl'> | null;
  title: string;
  placement: AdPlacement;
  mediaUrl: string;
  thumbnailUrl?: string | null;
  targetUrl: string;
  ctaText: string;
  targetCountries: string[];
  startDate: string;
  endDate: string;
  maxImpressions?: number | null;
  currentImpressions: number;
  currentClicks: number;
  costTokens?: number | null;
  boostPackage?: string | null;
  status: AdStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdServedPayload {
  id: string;
  title: string;
  placement: AdPlacement;
  mediaUrl: string;
  thumbnailUrl?: string | null;
  targetUrl: string;
  ctaText: string;
  advertiserName: string;
  trackId?: string | null;
  albumId?: string | null;
  videoId?: string | null;
}

export interface CampaignAnalytics {
  campaign: AdCampaign;
  totalImpressions: number;
  totalClicks: number;
  ctrPercent: number;
  completionRatePercent: number;
  countriesBreakdown: { country: string; impressions: number; clicks: number }[];
  devicesBreakdown: { device: string; impressions: number }[];
  dailyTrend: { date: string; impressions: number; clicks: number }[];
}

export interface BoostPackageOption {
  id: 'DISCOVERY' | 'TRENDING' | 'VIRAL' | 'CUSTOM';
  title: string;
  description: string;
  badge: string;
  impressions: number;
  tokensCost: number;
  durationDays: number;
}

// ── Currency & Token Conversion Engine Types ─────────────────────────────────


export interface CurrencyInfo {
  code: SupportedCurrency;
  name: string;
  symbol: string;
  flag: string;
  rateToEur: number; // How many units of this currency for 1 EUR
  isZeroDecimal: boolean;
  minAmount: number;
}

export interface TokenConversionResult {
  tokens: number;
  fiatAmount: number;
  currency: SupportedCurrency;
  unitValueFiat: number;
  platformFeeTokens?: number;
  artistTokens?: number;
  artistFiatAmount?: number;
  platformFeeFiat?: number;
}

export interface TokenPackWithLocalPrice {
  id: string;
  tokens: number;
  priceEur: number;
  priceLocal: number;
  currency: SupportedCurrency;
  currencySymbol: string;
  formattedPrice: string;
  label: string;
  isBestValue: boolean;
  isActive: boolean;
}

export type TokenTransactionType =
  | 'PURCHASE_PACK'
  | 'SPEND_CONTENT'
  | 'SPEND_BOOST'
  | 'SPEND_GIFT'
  | 'EARN_CONTENT'
  | 'EARN_GIFT'
  | 'ADMIN_ADJUST'
  | 'REFUND';

export interface TokenTransaction {
  id: string;
  userId: string;
  amount: number;
  type: TokenTransactionType;
  description: string;
  balanceAfter: number;
  campaignId?: string | null;
  campaign?: {
    id: string;
    title: string;
    placement: string;
  } | null;
  purchaseId?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
}
