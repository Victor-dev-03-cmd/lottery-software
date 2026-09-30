import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

// All 17 NLB / DLB lottery games
export const LOTTERY_GAMES: { name: string; nameSi: string; board: 'NLB' | 'DLB' }[] = [
  { name: 'Govisetha', nameSi: 'ගොවිසෙත', board: 'NLB' },
  { name: 'Mahajana Sampatha', nameSi: 'මහජන සම්පත', board: 'NLB' },
  { name: 'Supiri Vasana', nameSi: 'සුපිරි වාසනා', board: 'NLB' },
  { name: 'Shanida', nameSi: 'ශනිදා', board: 'NLB' },
  { name: 'Jayoda', nameSi: 'ජයෝදා', board: 'NLB' },
  { name: 'Neeroga', nameSi: 'නීරෝගා', board: 'NLB' },
  { name: 'Vasana Sampatha', nameSi: 'වාසනා සම්පත', board: 'NLB' },
  { name: 'Ada Kotipathi', nameSi: 'අද කෝටිපතී', board: 'DLB' },
  { name: 'Dhana Nidhanaya', nameSi: 'ධන නිධානය', board: 'DLB' },
  { name: 'Mega Power', nameSi: 'මෙගා පවර්', board: 'DLB' },
  { name: 'Lagna Wasanawa', nameSi: 'ලග්න වාසනාව', board: 'DLB' },
  { name: 'Handahana', nameSi: 'හඳහන', board: 'DLB' },
  { name: 'Jathika Sampatha', nameSi: 'ජාතික සම්පත', board: 'DLB' },
  { name: 'Kapruka', nameSi: 'කප්රුක', board: 'DLB' },
  { name: 'Nidhanaya', nameSi: 'නිධානය', board: 'DLB' },
  { name: 'Lucky 7', nameSi: 'ලකී 7', board: 'DLB' },
  { name: 'Govi Setha', nameSi: 'ගොවි සෙත', board: 'DLB' },
];

interface GamePickerProps {
  value: string;
  onSelect: (gameName: string) => void;
  placeholder?: string;
}

export function GamePicker({ value, onSelect, placeholder = 'Select game...' }: GamePickerProps) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = LOTTERY_GAMES.filter(
    (g) =>
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.nameSi.includes(search)
  );

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => setVisible(true)}>
        {value ? (
          <View>
            <Text style={styles.selectedText}>{value}</Text>
            <Text style={styles.selectedSi}>
              {LOTTERY_GAMES.find((g) => g.name === value)?.nameSi ?? ''}
            </Text>
          </View>
        ) : (
          <Text style={styles.placeholder}>{placeholder}</Text>
        )}
        <Feather name="chevron-down" size={18} color="#9CA3AF" />
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select Game</Text>
              <Text style={styles.sheetTitleSi}>ක්‍රීඩාව තෝරන්න</Text>
              <TouchableOpacity onPress={() => setVisible(false)} style={styles.closeBtn}>
                <Feather name="x" size={22} color="#1D1D1D" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.search}
              placeholder="Search..."
              placeholderTextColor="#9CA3AF"
              value={search}
              onChangeText={setSearch}
              autoFocus
            />

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.name}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.item, item.name === value && styles.itemSelected]}
                  onPress={() => {
                    onSelect(item.name);
                    setVisible(false);
                    setSearch('');
                  }}
                >
                  <View style={styles.itemText}>
                    <Text style={[styles.itemName, item.name === value && styles.itemNameSelected]}>
                      {item.name}
                    </Text>
                    <Text style={styles.itemSi}>{item.nameSi}</Text>
                  </View>
                  <View style={[styles.boardBadge, item.board === 'NLB' ? styles.nlb : styles.dlb]}>
                    <Text style={styles.boardText}>{item.board}</Text>
                  </View>
                  {item.name === value && <Feather name="check" size={16} color="#CF291D" />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 50,
  },
  placeholder: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  selectedText: {
    fontSize: 14,
    color: '#1D1D1D',
    fontWeight: '500',
  },
  selectedSi: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1D1D1D',
    flex: 1,
  },
  sheetTitleSi: {
    fontSize: 11,
    color: '#9CA3AF',
    marginRight: 12,
  },
  closeBtn: {
    padding: 4,
  },
  search: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1D1D1D',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  itemSelected: {
    backgroundColor: '#FEF2F2',
  },
  itemText: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    color: '#1D1D1D',
    fontWeight: '500',
  },
  itemNameSelected: {
    color: '#CF291D',
    fontWeight: '700',
  },
  itemSi: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 1,
  },
  boardBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 8,
  },
  nlb: {
    backgroundColor: '#EFF6FF',
  },
  dlb: {
    backgroundColor: '#F0FDF4',
  },
  boardText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#374151',
  },
});
