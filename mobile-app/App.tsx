import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { registerRootComponent } from 'expo';

import { ConnectionProvider } from './src/services/connection';
import HomeScreen from './src/screens/HomeScreen';
import PurchasesScreen from './src/screens/PurchasesScreen';
import ReturnsScreen from './src/screens/ReturnsScreen';
import StockScreen from './src/screens/StockScreen';
import InvoicesScreen from './src/screens/InvoicesScreen';
import ConnectionScreen from './src/screens/ConnectionScreen';

export type RootTabParamList = {
  Home: undefined;
  Purchases: undefined;
  Returns: undefined;
  Stock: undefined;
  Invoices: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const ACCENT   = '#CF291D';
const INACTIVE = '#9CA3AF';

function App() {
  return (
    <SafeAreaProvider>
      <ConnectionProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <Tab.Navigator
            screenOptions={{
              tabBarActiveTintColor:   ACCENT,
              tabBarInactiveTintColor: INACTIVE,
              tabBarStyle: {
                backgroundColor: '#FFFFFF',
                borderTopColor:  '#E5E7EB',
                borderTopWidth:  1,
                height:          60,
                paddingBottom:   8,
                paddingTop:      4,
              },
              tabBarLabelStyle:  { fontSize: 10, fontWeight: '600' },
              headerStyle:       { backgroundColor: '#FFFFFF', elevation: 0, shadowOpacity: 0 },
              headerTitleStyle:  { fontWeight: '800', fontSize: 17, color: '#1D1D1D' },
              headerTintColor:   ACCENT,
            }}
          >
            <Tab.Screen name="Home"      component={HomeScreen}
              options={{ title: 'Home', headerTitle: 'Lottery Scanner',
                tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }} />

            <Tab.Screen name="Purchases" component={PurchasesScreen}
              options={{ title: 'Purchase', headerTitle: 'New Purchase',
                tabBarIcon: ({ color, size }) => <Feather name="shopping-cart" size={size} color={color} /> }} />

            <Tab.Screen name="Returns"   component={ReturnsScreen}
              options={{ title: 'Returns', headerTitle: 'Supplier Return',
                tabBarIcon: ({ color, size }) => <Feather name="refresh-cw" size={size} color={color} /> }} />

            <Tab.Screen name="Stock"     component={StockScreen}
              options={{ title: 'Stock', headerTitle: 'Stock Overview',
                tabBarIcon: ({ color, size }) => <Feather name="package" size={size} color={color} /> }} />

            <Tab.Screen name="Invoices"  component={InvoicesScreen}
              options={{ title: 'Invoices', headerTitle: 'Invoices',
                tabBarIcon: ({ color, size }) => <Feather name="file-text" size={size} color={color} /> }} />

            <Tab.Screen name="Settings"  component={ConnectionScreen}
              options={{ title: 'Settings', headerTitle: 'Connection Settings',
                tabBarIcon: ({ color, size }) => <Feather name="settings" size={size} color={color} /> }} />
          </Tab.Navigator>
        </NavigationContainer>
      </ConnectionProvider>
    </SafeAreaProvider>
  );
}

// Required in SDK 52+ — registers App as the root component with React Native
registerRootComponent(App);
