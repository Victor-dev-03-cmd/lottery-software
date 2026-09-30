import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

interface StatCardProps {
  title: string;
  titleSi?: string;
  value: string | number;
  color?: string;
  icon?: FeatherIconName;
  subtitle?: string;
}

export function StatCard({ title, titleSi, value, color = '#CF291D', icon, subtitle }: StatCardProps) {
  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={styles.row}>
        <View style={styles.textBlock}>
          <Text style={styles.title}>{title}</Text>
          {titleSi ? <Text style={styles.titleSi}>{titleSi}</Text> : null}
        </View>
        {icon ? (
          <View style={[styles.iconWrapper, { backgroundColor: color + '1A' }]}>
            <Feather name={icon} size={20} color={color} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.value, { color }]}>{value}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1D1D1D',
  },
  titleSi: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 1,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
  },
});
