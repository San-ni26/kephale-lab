import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground } from 'react-native';

interface Genre {
  id: string;
  name: string;
  image: string;
}

const GENRES: Genre[] = [
  { id: 'Afrobeats', name: 'Afrobeats', image: 'https://images.unsplash.com/photo-1493225457124-a1a2a4af3049?q=80&w=300&auto=format&fit=crop' },
  { id: 'Rap', name: 'Rap / Hip-Hop', image: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=300&auto=format&fit=crop' },
  { id: 'Amapiano', name: 'Amapiano', image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=300&auto=format&fit=crop' },
  { id: 'R&B', name: 'R&B', image: 'https://images.unsplash.com/photo-1516280440502-601439773b06?q=80&w=300&auto=format&fit=crop' }, // Singer with smooth vibe
  { id: 'Gospel', name: 'Gospel', image: 'https://images.unsplash.com/photo-1510590337019-5ef8d3d32116?q=80&w=300&auto=format&fit=crop' }, // Worship/hands raised
  { id: 'Zouglou', name: 'Zouglou', image: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?q=80&w=300&auto=format&fit=crop' }, // African drums / acoustic vibe
  { id: 'Coupé-Décalé', name: 'Coupé-Décalé', image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=300&auto=format&fit=crop' }, // Energetic party vibe
];

interface GenreCarouselProps {
  selectedGenre: string | null;
  onSelectGenre: (genre: string | null) => void;
}

export default function GenreCarousel({ selectedGenre, onSelectGenre }: GenreCarouselProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Parcourir par genre</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {GENRES.map((genre) => {
          const isSelected = selectedGenre === genre.id;
          return (
            <TouchableOpacity 
              key={genre.id} 
              activeOpacity={0.8}
              onPress={() => onSelectGenre(isSelected ? null : genre.id)}
              style={[styles.card, isSelected && styles.cardSelected]}
            >
              <ImageBackground 
                source={{ uri: genre.image }} 
                style={styles.imageBackground}
                imageStyle={styles.imageStyle}
              >
                <View style={[styles.overlay, isSelected && styles.overlaySelected]}>
                  <Text style={[styles.genreName, isSelected && styles.genreNameSelected]}>
                    {genre.name}
                  </Text>
                </View>
              </ImageBackground>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 15,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginLeft: 20,
    marginBottom: 12,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  card: {
    width: 120,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: '#FF5A00',
  },
  imageBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageStyle: {
    borderRadius: 10,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Assombrir l'image
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  overlaySelected: {
    backgroundColor: 'rgba(255, 90, 0, 0.2)', // Teinte orangée si sélectionné
  },
  genreName: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  genreNameSelected: {
    color: '#FFF',
  }
});
