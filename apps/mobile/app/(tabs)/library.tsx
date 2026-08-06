import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore, usePlayerStore, useOfflineStore } from '../../src/stores';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { playlistsAPI, userAPI } from '../../src/lib/api';

type LibraryMode = 'achats' | 'telechargements' | 'playlists';

export default function LibraryScreen() {
  const { isAuthenticated } = useAuthStore();
  const [mode, setMode] = useState<LibraryMode>('achats');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const { data: playlistsData, isLoading: isLoadingPlaylists, refetch: refetchPlaylists } = useQuery({
    queryKey: ['playlists'],
    queryFn: async () => {
      const res = await playlistsAPI.list();
      return res.data.data;
    },
    enabled: isAuthenticated,
  });

  const { data: purchasesData, isLoading: isLoadingPurchases } = useQuery({
    queryKey: ['my-purchases'],
    queryFn: async () => {
      const res = await userAPI.getPurchases();
      return res.data.data;
    },
    enabled: isAuthenticated,
  });

  const playlists = useMemo(() => {
    return (playlistsData || []).filter((p: any) => 
      !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [playlistsData, searchQuery]);

  const purchases = useMemo(() => {
    return (purchasesData || []).filter((p: any) => {
      if (p.type === 'TOKEN_PACK') return false;
      if (p.type === 'TRACK' && !p.track) return false;
      if (p.type === 'ALBUM' && !p.album) return false;
      if (p.type === 'CLIP' && !p.video) return false;
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (p.type === 'TRACK' && !p.track.title.toLowerCase().includes(query) && !p.track.artist?.stageName?.toLowerCase().includes(query)) return false;
        if (p.type === 'ALBUM' && !p.album.title.toLowerCase().includes(query) && !p.album.artist?.stageName?.toLowerCase().includes(query)) return false;
        if (p.type === 'CLIP' && !p.video.title.toLowerCase().includes(query) && !p.video.artist?.stageName?.toLowerCase().includes(query)) return false;
      }
      
      return true;
    });
  }, [purchasesData, searchQuery]);
  const { setTrack, setPlaying } = usePlayerStore();
  const { downloads, downloading, downloadTrack, downloadVideo, downloadAlbum, removeDownload, clearAllDownloads } = useOfflineStore();

  const handlePlayPurchase = (purchase: any) => {
    if (purchase.type === 'TRACK' && purchase.track) {
      setTrack(purchase.track, [purchase.track]);
    } else if (purchase.type === 'ALBUM' && purchase.album) {
      router.push(`/album/${purchase.album.id}`);
    } else if (purchase.type === 'CLIP' && purchase.video) {
      router.push(`/clip/${purchase.video.id}`);
    }
  };

  const handlePlayAllPurchases = () => {
    const tracks = purchases.filter((p: any) => p.type === 'TRACK' && p.track).map((p: any) => p.track);
    if (tracks.length > 0) {
      setTrack(tracks[0], tracks);
    }
  };

  const offlineAlbums = useMemo(() => {
    let arr = Object.values(downloads).filter((item: any) => item.type === 'ALBUM');
    if (searchQuery) {
      arr = arr.filter((item: any) => item.title?.toLowerCase().includes(searchQuery.toLowerCase()) || item.artistName?.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return arr;
  }, [downloads, searchQuery]);

  const offlineTracks = useMemo(() => {
    let arr = Object.values(downloads).filter((item: any) => item.type === 'TRACK');
    if (searchQuery) {
      arr = arr.filter((item: any) => item.title?.toLowerCase().includes(searchQuery.toLowerCase()) || item.artistName?.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return arr;
  }, [downloads, searchQuery]);



  const handlePlayOffline = (item: any) => {
    if (item.type === 'TRACK') {
      const track = {
        id: item.id,
        title: item.title,
        audioUrl: item.localFileUri,
        coverUrl: item.localCoverUri || '',
        price: 0,
        currency: 'XOF',
        duration: item.duration || 0,
        artist: {
          id: 'offline',
          stageName: item.artistName,
          avatar: '',
          coverImage: '',
          isVerified: false,
        },
        status: 'ACTIVE',
        plays: 0,
      };
      setTrack(track as any, [track as any]);
    } else if (item.type === 'ALBUM') {
      const albumTracks = offlineTracks
        .filter((t: any) => t.albumId === item.id)
        .map((t: any) => ({
          id: t.id,
          title: t.title,
          audioUrl: t.localFileUri,
          coverUrl: t.localCoverUri || item.localCoverUri || '',
          price: 0,
          currency: 'XOF',
          duration: t.duration || 0,
          artist: {
            id: 'offline',
            stageName: t.artistName,
            avatar: '',
            coverImage: '',
            isVerified: false,
          },
          status: 'ACTIVE',
          plays: 0,
        }));
      if (albumTracks.length > 0) {
        setTrack(albumTracks[0] as any, albumTracks as any[]);
      } else {
        router.push(`/album/${item.id}`);
      }
    }
  };

  const handlePlayAllOffline = () => {
    const tracks = offlineTracks.map((item: any) => ({
      id: item.id,
      title: item.title,
      audioUrl: item.localFileUri,
      coverUrl: item.localCoverUri || '',
      price: 0,
      currency: 'XOF',
      duration: item.duration || 0,
      artist: {
        id: 'offline',
        stageName: item.artistName,
        avatar: '',
        coverImage: '',
        isVerified: false,
      },
      status: 'ACTIVE',
      plays: 0,
    }));
    if (tracks.length > 0) {
      setTrack(tracks[0] as any, tracks as any[]);
    }
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <Image source={require('../../assets/library_bg.png')} style={styles.backgroundImage} />
        <LinearGradient colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.7)', '#000000']} style={styles.backgroundOverlay} />
        <View style={styles.unauthContainer}>
          <Feather name="music" size={64} color="#FF5A00" />
          <Text style={styles.unauthTitle}>Votre Bibliothèque</Text>
          <Text style={styles.unauthText}>Connectez-vous pour accéder à vos musiques achetées, vos téléchargements hors ligne et vos playlists.</Text>
          <TouchableOpacity
            style={styles.unauthButton}
            onPress={() => router.push('/(auth)/welcome')}
          >
            <Text style={styles.unauthButtonText}>Se connecter</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Image source={require('../../assets/library_bg.png')} style={styles.backgroundImage} />
      <LinearGradient colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)', '#000000']} style={styles.backgroundOverlay} />
      <View style={styles.header}>
        {showSearch ? (
          <View style={styles.searchContainer}>
            <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); }}>
              <Feather name="arrow-left" size={24} color="#FFFFFF" style={{ marginRight: 12 }} />
            </TouchableOpacity>
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher dans ma bibliothèque..."
              placeholderTextColor="#888"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x" size={20} color="#888" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            <Text style={styles.headerTitle}>Ma Bibliothèque</Text>
            <TouchableOpacity onPress={() => setShowSearch(true)}>
              <Feather name="search" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[styles.segmentButton, mode === 'achats' && styles.segmentActive]}
          onPress={() => setMode('achats')}
        >
          <Text style={[styles.segmentText, mode === 'achats' && styles.segmentTextActive]}>Achetés</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentButton, mode === 'telechargements' && styles.segmentActive]}
          onPress={() => setMode('telechargements')}
        >
          <Text style={[styles.segmentText, mode === 'telechargements' && styles.segmentTextActive]}>Hors Ligne</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentButton, mode === 'playlists' && styles.segmentActive]}
          onPress={() => setMode('playlists')}
        >
          <Text style={[styles.segmentText, mode === 'playlists' && styles.segmentTextActive]}>Playlists</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {mode === 'achats' && (
          <View style={styles.listContainer}>
            <View style={styles.playAllRow}>
              <Text style={styles.itemCount}>{purchases.length} achats</Text>
              {purchases.some((p: any) => p.type === 'TRACK') && (
                <TouchableOpacity style={styles.playAllButton} onPress={handlePlayAllPurchases}>
                  <Feather name="play" size={16} color="#FFFFFF" />
                  <Text style={styles.playAllText}>Tout lire</Text>
                </TouchableOpacity>
              )}
            </View>

            {isLoadingPurchases ? (
              <Text style={{ color: '#A0A0A0', textAlign: 'center', marginTop: 20 }}>Chargement...</Text>
            ) : purchases.length === 0 ? (
              <Text style={{ color: '#A0A0A0', textAlign: 'center', marginTop: 20 }}>Vous n'avez encore rien acheté.</Text>
            ) : (
              purchases.map((purchase: any) => {
                let title = 'Inconnu';
                let subtitle = '';
                let image = null;
                let icon = 'music';

                if (purchase.type === 'TRACK' && purchase.track) {
                  title = purchase.track.title;
                  subtitle = purchase.track.artist?.stageName || 'Artiste';
                  image = purchase.track.album?.coverUrl;
                  icon = 'music';
                } else if (purchase.type === 'ALBUM' && purchase.album) {
                  title = purchase.album.title;
                  subtitle = purchase.album.artist?.stageName || 'Artiste';
                  image = purchase.album.coverUrl;
                  icon = 'disc';
                } else if (purchase.type === 'CLIP' && purchase.video) {
                  title = purchase.video.title;
                  subtitle = purchase.video.artist?.stageName || 'Artiste';
                  image = purchase.video.thumbnailUrl;
                  icon = 'video';
                }

                return (
                  <TouchableOpacity
                    key={purchase.id}
                    style={styles.trackRow}
                    onPress={() => handlePlayPurchase(purchase)}
                  >
                    {image ? (
                      <Image 
                        source={{ uri: image }} 
                        style={styles.trackCoverPlaceholder} 
                        cachePolicy="memory-disk"
                        contentFit="cover"
                        transition={150}
                      />
                    ) : (
                      <View style={styles.trackCoverPlaceholder}>
                        <Feather name={icon as any} size={24} color="#A0A0A0" />
                      </View>
                    )}
                    <View style={styles.trackInfo}>
                      <Text style={styles.trackTitle} numberOfLines={1} ellipsizeMode="tail">{title}</Text>
                      <Text style={styles.trackArtist} numberOfLines={1} ellipsizeMode="tail">{subtitle} • {purchase.type}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                      {/* Offline Download Action for Purchased Item */}
                      {purchase.type === 'TRACK' && purchase.track && (
                        downloads[purchase.track.id] ? (
                          <TouchableOpacity onPress={() => {
                            Alert.alert(
                              'Supprimer',
                              `Supprimer "${purchase.track.title}" des fichiers hors ligne ?`,
                              [
                                { text: 'Annuler', style: 'cancel' },
                                { text: 'Supprimer', style: 'destructive', onPress: () => removeDownload(purchase.track.id) }
                              ]
                            );
                          }}>
                            <Feather name="check-circle" size={20} color="#10B981" />
                          </TouchableOpacity>
                        ) : downloading[purchase.track.id] !== undefined ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <ActivityIndicator size="small" color="#FF5A00" />
                            <Text style={{ color: '#FF5A00', fontSize: 10 }}>{downloading[purchase.track.id]}%</Text>
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => downloadTrack(purchase.track)}>
                            <Feather name="download" size={20} color="#A0A0A0" />
                          </TouchableOpacity>
                        )
                      )}

                      {purchase.type === 'ALBUM' && purchase.album && (
                        downloads[purchase.album.id] ? (
                          <TouchableOpacity onPress={() => {
                            Alert.alert(
                              'Supprimer',
                              `Supprimer l'album "${purchase.album.title}" et tous ses titres ?`,
                              [
                                { text: 'Annuler', style: 'cancel' },
                                { text: 'Supprimer', style: 'destructive', onPress: () => removeDownload(purchase.album.id) }
                              ]
                            );
                          }}>
                            <Feather name="check-circle" size={20} color="#10B981" />
                          </TouchableOpacity>
                        ) : downloading[purchase.album.id] !== undefined ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <ActivityIndicator size="small" color="#FF5A00" />
                            <Text style={{ color: '#FF5A00', fontSize: 10 }}>{downloading[purchase.album.id]}%</Text>
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => downloadAlbum(purchase.album.id)}>
                            <Feather name="download" size={20} color="#A0A0A0" />
                          </TouchableOpacity>
                        )
                      )}

                      {purchase.type === 'CLIP' && purchase.video && (
                        downloads[purchase.video.id] ? (
                          <TouchableOpacity onPress={() => {
                            Alert.alert(
                              'Supprimer',
                              `Supprimer cette vidéo des fichiers hors ligne ?`,
                              [
                                { text: 'Annuler', style: 'cancel' },
                                { text: 'Supprimer', style: 'destructive', onPress: () => removeDownload(purchase.video.id) }
                              ]
                            );
                          }}>
                            <Feather name="check-circle" size={20} color="#10B981" />
                          </TouchableOpacity>
                        ) : downloading[purchase.video.id] !== undefined ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <ActivityIndicator size="small" color="#FF5A00" />
                            <Text style={{ color: '#FF5A00', fontSize: 10 }}>{downloading[purchase.video.id]}%</Text>
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => downloadVideo(purchase.video)}>
                            <Feather name="download" size={20} color="#A0A0A0" />
                          </TouchableOpacity>
                        )
                      )}

                      {/* Main Action Button */}
                      {purchase.type === 'TRACK' ? (
                        <TouchableOpacity onPress={() => handlePlayPurchase(purchase)}>
                          <Feather name="play-circle" size={24} color="#FF5A00" />
                        </TouchableOpacity>
                      ) : (
                        <Feather name="chevron-right" size={24} color="#A0A0A0" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {mode === 'telechargements' && (
          <View style={styles.listContainer}>
            <View style={styles.playAllRow}>
              <Text style={styles.itemCount}>
                {Object.keys(downloads).length} téléchargement(s)
              </Text>
              {Object.keys(downloads).length > 0 && (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {offlineTracks.length > 0 && (
                    <TouchableOpacity style={styles.playAllButton} onPress={handlePlayAllOffline}>
                      <Feather name="play" size={15} color="#FFFFFF" />
                      <Text style={styles.playAllText}>Tout lire</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity 
                    style={[styles.playAllButton, { backgroundColor: '#262626', paddingHorizontal: 12 }]} 
                    onPress={() => {
                      Alert.alert(
                        'Tout supprimer',
                        'Voulez-vous supprimer tous les fichiers hors ligne ?',
                        [
                          { text: 'Annuler', style: 'cancel' },
                          { text: 'Supprimer', style: 'destructive', onPress: clearAllDownloads }
                        ]
                      );
                    }}
                  >
                    <Feather name="trash-2" size={15} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {Object.keys(downloads).length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="download-cloud" size={48} color="#444" />
                <Text style={styles.emptyText}>Aucun contenu téléchargé pour l'écoute hors ligne.</Text>
              </View>
            ) : (
              <View style={{ gap: 20 }}>
                {/* --- DOSSIERS DE VIDÉOS --- */}
                <View style={styles.sectionBlock}>
                  <View style={styles.sectionHeaderRow}>
                    <Feather name="folder" size={16} color="#FF5A00" />
                    <Text style={styles.sectionHeaderTitle}>Vidéos Téléchargées</Text>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.cardRow}
                    onPress={() => router.push('/offline-clips')}
                  >
                    <View style={styles.videoThumbPlaceholder}>
                      <Feather name="video" size={24} color="#FF5A00" />
                    </View>
                    <View style={styles.trackInfo}>
                      <Text style={styles.trackTitle}>Clips Vidéo</Text>
                      <Text style={styles.trackArtist}>Consulter vos clips téléchargés</Text>
                    </View>
                    <Feather name="chevron-right" size={24} color="#A0A0A0" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.cardRow}
                    onPress={() => router.push('/offline-reels')}
                  >
                    <View style={styles.videoThumbPlaceholder}>
                      <Feather name="smartphone" size={24} color="#FF5A00" />
                    </View>
                    <View style={styles.trackInfo}>
                      <Text style={styles.trackTitle}>Reels (Shorts)</Text>
                      <Text style={styles.trackArtist}>Consulter vos reels téléchargés</Text>
                    </View>
                    <Feather name="chevron-right" size={24} color="#A0A0A0" />
                  </TouchableOpacity>
                </View>

                {/* --- BLOC 1: ALBUMS TÉLÉCHARGÉS --- */}
                {offlineAlbums.length > 0 && (
                  <View style={styles.sectionBlock}>
                    <View style={styles.sectionHeaderRow}>
                      <Feather name="disc" size={16} color="#FF5A00" />
                      <Text style={styles.sectionHeaderTitle}>Albums ({offlineAlbums.length})</Text>
                    </View>
                    {offlineAlbums.map((item: any) => {
                      const sizeMb = item.sizeBytes ? (item.sizeBytes / (1024 * 1024)).toFixed(1) : null;
                      const hasCover = !!item.localCoverUri;

                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.cardRow}
                          onPress={() => handlePlayOffline(item)}
                        >
                          {hasCover ? (
                            <Image source={{ uri: item.localCoverUri }} style={styles.trackCoverPlaceholder} />
                          ) : (
                            <View style={styles.trackCoverPlaceholder}>
                              <Feather name="disc" size={24} color="#A0A0A0" />
                            </View>
                          )}
                          <View style={styles.trackInfo}>
                            <Text style={styles.trackTitle} numberOfLines={1} ellipsizeMode="tail">{item.title}</Text>
                            <Text style={styles.trackArtist} numberOfLines={1} ellipsizeMode="tail">
                              {item.artistName} • Album{sizeMb ? ` • ${sizeMb} MB` : ''}
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <TouchableOpacity style={styles.iconCircleBtn} onPress={() => handlePlayOffline(item)}>
                              <Feather name="play" size={14} color="#FF5A00" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => {
                              Alert.alert(
                                'Supprimer l\'album',
                                `Supprimer l'album "${item.title}" et ses morceaux hors ligne ?`,
                                [
                                  { text: 'Annuler', style: 'cancel' },
                                  { text: 'Supprimer', style: 'destructive', onPress: () => removeDownload(item.id) }
                                ]
                              );
                            }}>
                              <Feather name="trash-2" size={18} color="#FF3B30" />
                            </TouchableOpacity>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* --- BLOC 2: CHANSONS / SINGLES INDIVIDUELS --- */}
                {offlineTracks.length > 0 && (
                  <View style={styles.sectionBlock}>
                    <View style={styles.sectionHeaderRow}>
                      <Feather name="music" size={16} color="#FF5A00" />
                      <Text style={styles.sectionHeaderTitle}>Morceaux & Singles ({offlineTracks.length})</Text>
                    </View>
                    {offlineTracks.map((item: any) => {
                      const sizeMb = (item.sizeBytes / (1024 * 1024)).toFixed(1);
                      const hasCover = !!item.localCoverUri;

                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.cardRow}
                          onPress={() => handlePlayOffline(item)}
                        >
                          {hasCover ? (
                            <Image source={{ uri: item.localCoverUri }} style={styles.trackCoverPlaceholder} />
                          ) : (
                            <View style={styles.trackCoverPlaceholder}>
                              <Feather name="music" size={24} color="#A0A0A0" />
                            </View>
                          )}
                          <View style={styles.trackInfo}>
                            <Text style={styles.trackTitle} numberOfLines={1} ellipsizeMode="tail">{item.title}</Text>
                            <Text style={styles.trackArtist} numberOfLines={1} ellipsizeMode="tail">{item.artistName} • {sizeMb} MB</Text>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <TouchableOpacity onPress={() => handlePlayOffline(item)}>
                              <Feather name="play-circle" size={24} color="#FF5A00" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => {
                              Alert.alert(
                                'Supprimer le morceau',
                                `Supprimer "${item.title}" des fichiers hors ligne ?`,
                                [
                                  { text: 'Annuler', style: 'cancel' },
                                  { text: 'Supprimer', style: 'destructive', onPress: () => removeDownload(item.id) }
                                ]
                              );
                            }}>
                              <Feather name="trash-2" size={18} color="#FF3B30" />
                            </TouchableOpacity>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

              </View>
            )}
          </View>
        )}

        {mode === 'playlists' && (
          <View style={styles.listContainer}>
            <TouchableOpacity
              style={styles.newPlaylistButton}
              onPress={() => {
                Alert.prompt('Nouvelle Playlist', 'Nom de la playlist', async (text) => {
                  if (text) {
                    try {
                      await playlistsAPI.create(text);
                      refetchPlaylists();
                    } catch (e) {
                      Alert.alert('Erreur', 'Impossible de créer la playlist');
                    }
                  }
                });
              }}
            >
              <Feather name="plus" size={24} color="#FF5A00" />
              <Text style={styles.newPlaylistText}>Créer une playlist</Text>
            </TouchableOpacity>

            {isLoadingPlaylists ? (
              <Text style={{ color: '#A0A0A0', textAlign: 'center', marginTop: 20 }}>Chargement...</Text>
            ) : playlists.length === 0 ? (
              <Text style={{ color: '#A0A0A0', textAlign: 'center', marginTop: 20 }}>Aucune playlist pour le moment.</Text>
            ) : (
              playlists.map((playlist) => (
                <TouchableOpacity
                  key={playlist.id}
                  style={styles.trackRow}
                  onPress={() => router.push(`/playlist/${playlist.id}`)}
                >
                  <View style={styles.playlistCover}>
                    <Feather name="list" size={24} color="#FFFFFF" />
                  </View>
                  <View style={styles.trackInfo}>
                    <Text style={styles.trackTitle} numberOfLines={1} ellipsizeMode="tail">{playlist.title}</Text>
                    <Text style={styles.trackArtist} numberOfLines={1} ellipsizeMode="tail">{playlist._count?.items || 0} titres</Text>
                  </View>
                  <Feather name="chevron-right" size={24} color="#A0A0A0" />
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  backgroundImage: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover' },
  backgroundOverlay: { position: 'absolute', width: '100%', height: '100%' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 28, color: '#FFFFFF', fontWeight: 'bold' },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 48,
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 16,
    paddingVertical: 10,
  },

  segmentContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    padding: 4,
    marginBottom: 20,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 16,
  },
  segmentActive: {
    backgroundColor: '#FF5A00',
  },
  segmentText: {
    color: '#A0A0A0',
    fontWeight: '600',
    fontSize: 13,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },

  listContainer: {
    paddingHorizontal: 20,
  },
  playAllRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  itemCount: {
    color: '#A0A0A0',
    fontSize: 14,
  },
  playAllButton: {
    flexDirection: 'row',
    backgroundColor: '#FF5A00',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    gap: 8,
  },
  playAllText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },

  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionBlock: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  trackCoverPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoThumbPlaceholder: {
    width: 64,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 90, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#888888',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  playlistCover: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#FF5A00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackInfo: { flex: 1, marginLeft: 14, marginRight: 8 },
  trackTitle: { color: '#FFFFFF', fontWeight: '600', fontSize: 15, marginBottom: 2 },
  trackArtist: { color: '#A0A0A0', fontSize: 13 },

  newPlaylistButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: 16,
    gap: 16,
  },
  newPlaylistText: {
    color: '#FF5A00',
    fontSize: 16,
    fontWeight: '600',
  },

  unauthContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  unauthTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 24,
    marginBottom: 12,
  },
  unauthText: {
    color: '#A0A0A0',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  unauthButton: {
    backgroundColor: '#FF5A00',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
    width: '100%',
    alignItems: 'center',
  },
  unauthButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
