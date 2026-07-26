import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ApiClient,
  defaultApiUrl,
  formatCurrency,
  mediaForProduct,
  originalCaptionForProduct,
  phoneLanApiUrl,
} from './src/api';
import {
  Product,
  RunnerListing,
  RunnerProfile,
  RunnerShopLink,
  User,
} from './src/types';

type Tab = 'control' | 'listings' | 'shops' | 'products' | 'profile';

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'control', label: 'Control' },
  { id: 'listings', label: 'Listings' },
  { id: 'shops', label: 'Shops' },
  { id: 'products', label: 'Products' },
  { id: 'profile', label: 'Profile' },
];

const asArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return (value as { data: T[] }).data;
  }
  return [];
};

export default function App() {
  const [baseUrl, setBaseUrl] = useState(defaultApiUrl);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<RunnerProfile | null>(null);
  const [listings, setListings] = useState<RunnerListing[]>([]);
  const [shops, setShops] = useState<RunnerShopLink[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('control');
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>([]);
  const [postingGroup, setPostingGroup] = useState('');
  const [markup, setMarkup] = useState('25');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const api = useMemo(() => new ApiClient(baseUrl, token), [baseUrl, token]);
  const safeShops = asArray<RunnerShopLink>(shops);
  const safeListings = asArray<RunnerListing>(listings);
  const safeProducts = asArray<Product>(products);
  const approvedShops = safeShops.filter((item) => item.status === 'APPROVED');
  const selectedListings = safeListings.filter((item) =>
    selectedListingIds.includes(item.id),
  );

  const showError = (error: unknown, fallback: string) => {
    const text = error instanceof Error ? error.message : fallback;
    setMessage(text);
    Alert.alert('Runner Commerce', text);
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      showError(error, 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    const [nextProfile, nextListings, nextShops, nextProducts] =
      await Promise.all([
        api.getProfile(),
        api.getListings(),
        api.getMyShops(),
        api.getAvailableProducts(),
      ]);

    setProfile(nextProfile);
    setListings(asArray<RunnerListing>(nextListings));
    setShops(asArray<RunnerShopLink>(nextShops));
    setProducts(asArray<Product>(nextProducts));
    setPostingGroup(
      (current) => current || nextProfile?.whatsappGroup || 'Runner Commerce DEV Reposts',
    );
  };

  const handleLogin = async (identifier: string, password: string) => {
    await run(async () => {
      api.setBaseUrl(baseUrl);
      const response = await api.login(identifier, password);
      setToken(response.accessToken);
      setUser(response.user);
      api.setToken(response.accessToken);
      await refreshWithToken(response.accessToken);
      setMessage('Logged in and synced');
    });
  };

  const testBackendConnection = async () => {
    await run(async () => {
      const testApi = new ApiClient(baseUrl, null);
      const health = await testApi.health();
      setMessage(`Backend connected: ${health.status}`);
    });
  };

  const refreshWithToken = async (nextToken: string) => {
    const nextApi = new ApiClient(baseUrl, nextToken);
    const [nextProfile, nextListings, nextShops, nextProducts] =
      await Promise.all([
        nextApi.getProfile(),
        nextApi.getListings(),
        nextApi.getMyShops(),
        nextApi.getAvailableProducts(),
      ]);

    setProfile(nextProfile);
    setListings(asArray<RunnerListing>(nextListings));
    setShops(asArray<RunnerShopLink>(nextShops));
    setProducts(asArray<Product>(nextProducts));
    setPostingGroup(nextProfile?.whatsappGroup || 'Runner Commerce DEV Reposts');
  };

  const toggleListing = (id: string) => {
    setSelectedListingIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const toggleShop = (id: string) => {
    setSelectedShopIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const queueCapture = async () => {
    await run(async () => {
      const response = await api.captureApprovedShops(
        selectedShopIds.length > 0 ? selectedShopIds : undefined,
      );
      setMessage(
        response.message ||
          `Capture queued for ${response.shopCount || selectedShopIds.length || approvedShops.length} shop(s)`,
      );
      setSelectedShopIds([]);
    });
  };

  const queueRepost = async () => {
    if (selectedListingIds.length === 0) {
      Alert.alert('Runner Commerce', 'Select at least one listing to repost');
      return;
    }

    if (!postingGroup.trim()) {
      Alert.alert('Runner Commerce', 'Enter a runner WhatsApp group name');
      return;
    }

    await run(async () => {
      const response = await api.queueRepost({
        listingIds: selectedListingIds,
        groupIdOrName: postingGroup.trim(),
      });
      setMessage(response.message || 'Repost queued for WhatsApp bridge');
      setSelectedListingIds([]);
      await refresh();
    });
  };

  const updateAutoPost = async (
    listing: RunnerListing,
    autoPostApproved: boolean,
  ) => {
    await run(async () => {
      const updated = await api.updateListingAutoPost(
        listing.id,
        autoPostApproved,
      );
      setListings((current) =>
        current.map((item) => (item.id === listing.id ? updated : item)),
      );
    });
  };

  const deleteListing = async (listing: RunnerListing) => {
    Alert.alert('Remove listing', 'Remove this item from runner listings?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await api.deleteListing(listing.id);
            setListings((current) =>
              current.filter((item) => item.id !== listing.id),
            );
            setSelectedListingIds((current) =>
              current.filter((item) => item !== listing.id),
            );
          }),
      },
    ]);
  };

  const addProduct = async (product: Product) => {
    const markupValue = Math.max(0, Number(markup || 0)) / 100;
    await run(async () => {
      await api.createListing(product.id, markupValue);
      await refresh();
      setActiveTab('listings');
      setMessage('Product added to runner listings');
    });
  };

  const saveProfile = async () => {
    await run(async () => {
      const updated = await api.updateProfile({
        name: profile?.user?.name,
        phone: profile?.phone || profile?.user?.phone,
        serviceArea: profile?.serviceArea,
        vehicleType: profile?.vehicleType,
        vehicleNumber: profile?.vehicleNumber,
        whatsappGroup: postingGroup,
        autoPostEnabled: Boolean(profile?.autoPostEnabled),
      });
      setProfile(updated);
      setMessage('Profile updated');
    });
  };

  if (!token || !user) {
    return (
      <LoginScreen
        baseUrl={baseUrl}
        setBaseUrl={setBaseUrl}
        busy={busy}
        message={message}
        onLogin={handleLogin}
        onTestConnection={testBackendConnection}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>Runner Commerce</Text>
          <Text style={styles.headerSubtext}>
            {profile?.user?.name || user.name} - {profile?.status || user.role}
          </Text>
        </View>
        <Pressable style={styles.ghostButton} onPress={() => run(refresh)}>
          <Text style={styles.ghostButtonText}>Refresh</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.activeTab]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.id && styles.activeTabText,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {busy && (
        <View style={styles.busyBar}>
          <ActivityIndicator size="small" color="#0f766e" />
          <Text style={styles.busyText}>Working...</Text>
        </View>
      )}

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <ScrollView contentContainerStyle={styles.content}>
        {activeTab === 'control' && (
          <ControlTab
            listings={safeListings}
            shops={safeShops}
            selectedListings={selectedListings}
            postingGroup={postingGroup}
            setPostingGroup={setPostingGroup}
            queueCapture={queueCapture}
            queueRepost={queueRepost}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === 'listings' && (
          <ListingsTab
            listings={safeListings}
            selectedListingIds={selectedListingIds}
            toggleListing={toggleListing}
            updateAutoPost={updateAutoPost}
            deleteListing={deleteListing}
            postingGroup={postingGroup}
            setPostingGroup={setPostingGroup}
            queueRepost={queueRepost}
          />
        )}

        {activeTab === 'shops' && (
          <ShopsTab
            shops={safeShops}
            selectedShopIds={selectedShopIds}
            toggleShop={toggleShop}
            queueCapture={queueCapture}
          />
        )}

        {activeTab === 'products' && (
          <ProductsTab
            products={safeProducts}
            markup={markup}
            setMarkup={setMarkup}
            addProduct={addProduct}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileTab
            profile={profile}
            setProfile={setProfile}
            postingGroup={postingGroup}
            setPostingGroup={setPostingGroup}
            saveProfile={saveProfile}
            logout={() => {
              setToken(null);
              setUser(null);
            }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function LoginScreen(props: {
  baseUrl: string;
  setBaseUrl: (value: string) => void;
  busy: boolean;
  message: string;
  onLogin: (identifier: string, password: string) => Promise<void>;
  onTestConnection: () => Promise<void>;
}) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.loginContent}>
        <Text style={styles.loginTitle}>Runner Commerce</Text>
        <Text style={styles.loginSubtitle}>
          Mobile control for capture, listings, and WhatsApp reposting.
        </Text>

        <View style={styles.panel}>
          <Text style={styles.label}>Backend URL</Text>
          <TextInput
            value={props.baseUrl}
            onChangeText={props.setBaseUrl}
            autoCapitalize="none"
            style={styles.input}
          />
          <Text style={styles.helpText}>
            Android emulator uses http://10.0.2.2:3001. A real phone must use
            this laptop Wi-Fi address: {phoneLanApiUrl}
          </Text>
          <View style={styles.quickActions}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => props.setBaseUrl('http://10.0.2.2:3001')}
            >
              <Text style={styles.secondaryButtonText}>Emulator URL</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => props.setBaseUrl(phoneLanApiUrl)}
            >
              <Text style={styles.secondaryButtonText}>Phone URL</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Phone or email</Text>
          <TextInput
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              style={styles.passwordInput}
            />
            <Pressable
              accessibilityLabel={
                showPassword ? 'Hide password' : 'Show password'
              }
              style={styles.passwordToggle}
              onPress={() => setShowPassword((current) => !current)}
            >
              <Text style={styles.passwordToggleText}>
                {showPassword ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          </View>

          <Pressable
            disabled={props.busy}
            style={[styles.primaryButton, props.busy && styles.disabledButton]}
            onPress={() => props.onLogin(identifier.trim(), password)}
          >
            <Text style={styles.primaryButtonText}>
              {props.busy ? 'Signing in...' : 'Sign in'}
            </Text>
          </Pressable>
          <Pressable
            disabled={props.busy}
            style={styles.secondaryButton}
            onPress={props.onTestConnection}
          >
            <Text style={styles.secondaryButtonText}>Test backend</Text>
          </Pressable>

          {props.message ? (
            <Text style={styles.errorText}>{props.message}</Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ControlTab(props: {
  listings: RunnerListing[];
  shops: RunnerShopLink[];
  selectedListings: RunnerListing[];
  postingGroup: string;
  setPostingGroup: (value: string) => void;
  queueCapture: () => void;
  queueRepost: () => void;
  setActiveTab: (tab: Tab) => void;
}) {
  const activeListings = props.listings.filter((item) => item.status === 'ACTIVE');
  const approvedListings = activeListings.filter((item) => item.autoPostApproved);
  const approvedShops = props.shops.filter((item) => item.status === 'APPROVED');

  return (
    <View style={styles.stack}>
      <View style={styles.metricsGrid}>
        <Metric label="Approved shops" value={approvedShops.length} />
        <Metric label="Active listings" value={activeListings.length} />
        <Metric label="Auto-post ready" value={approvedListings.length} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Automation timing</Text>
        <Text style={styles.bodyText}>Shop capture runs every 15 minutes.</Text>
        <Text style={styles.bodyText}>Import and auto-list runs every 10 minutes.</Text>
        <Text style={styles.bodyText}>Runner group reposting runs every 60 minutes.</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Manual controls</Text>
        <Pressable style={styles.primaryButton} onPress={props.queueCapture}>
          <Text style={styles.primaryButtonText}>Queue capture for shops</Text>
        </Pressable>

        <Text style={styles.label}>Runner WhatsApp group</Text>
        <TextInput
          value={props.postingGroup}
          onChangeText={props.setPostingGroup}
          style={styles.input}
        />
        <Pressable style={styles.primaryButton} onPress={props.queueRepost}>
          <Text style={styles.primaryButtonText}>
            Queue selected listings ({props.selectedListings.length})
          </Text>
        </Pressable>
      </View>

      <View style={styles.quickActions}>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => props.setActiveTab('listings')}
        >
          <Text style={styles.secondaryButtonText}>Select listings</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => props.setActiveTab('shops')}
        >
          <Text style={styles.secondaryButtonText}>Choose shops</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ListingsTab(props: {
  listings: RunnerListing[];
  selectedListingIds: string[];
  toggleListing: (id: string) => void;
  updateAutoPost: (listing: RunnerListing, value: boolean) => void;
  deleteListing: (listing: RunnerListing) => void;
  postingGroup: string;
  setPostingGroup: (value: string) => void;
  queueRepost: () => void;
}) {
  if (props.listings.length === 0) {
    return <EmptyState title="No runner listings yet" text="Add products from approved shops first." />;
  }

  return (
    <View style={styles.stack}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Bridge repost group</Text>
        <TextInput
          value={props.postingGroup}
          onChangeText={props.setPostingGroup}
          style={styles.input}
        />
        <Pressable style={styles.primaryButton} onPress={props.queueRepost}>
          <Text style={styles.primaryButtonText}>
            Queue selected ({props.selectedListingIds.length})
          </Text>
        </Pressable>
      </View>

      {props.listings.map((listing) => (
        <ListingCard
          key={listing.id}
          listing={listing}
          selected={props.selectedListingIds.includes(listing.id)}
          toggle={() => props.toggleListing(listing.id)}
          updateAutoPost={(value) => props.updateAutoPost(listing, value)}
          deleteListing={() => props.deleteListing(listing)}
        />
      ))}
    </View>
  );
}

function ListingCard(props: {
  listing: RunnerListing;
  selected: boolean;
  toggle: () => void;
  updateAutoPost: (value: boolean) => void;
  deleteListing: () => void;
}) {
  const product = props.listing.product;
  const media = mediaForProduct(product);
  const caption = originalCaptionForProduct(product);

  return (
    <View style={[styles.card, props.selected && styles.selectedCard]}>
      <Pressable style={styles.cardHeader} onPress={props.toggle}>
        <Text style={styles.cardTitle}>{product?.name || 'Product'}</Text>
        <Text style={styles.selectPill}>{props.selected ? 'Selected' : 'Select'}</Text>
      </Pressable>
      <MediaStrip media={media} />
      <Text style={styles.price}>{formatCurrency(props.listing.runnerPrice)}</Text>
      <Text style={styles.metaText}>{product?.shop?.name || 'WhatsApp shop'}</Text>
      <Text style={styles.captionText} numberOfLines={5}>
        {caption || product?.description || 'Original WhatsApp caption unavailable.'}
      </Text>
      <View style={styles.rowBetween}>
        <Text style={styles.bodyText}>Auto-post approved</Text>
        <Switch
          value={Boolean(props.listing.autoPostApproved)}
          onValueChange={props.updateAutoPost}
          trackColor={{ true: '#99f6e4', false: '#cbd5e1' }}
          thumbColor={props.listing.autoPostApproved ? '#0f766e' : '#f8fafc'}
        />
      </View>
      <View style={styles.rowBetween}>
        <Text style={styles.metaText}>
          Posted {props.listing.postCount || 0} time(s)
        </Text>
        <Pressable style={styles.dangerButton} onPress={props.deleteListing}>
          <Text style={styles.dangerButtonText}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ShopsTab(props: {
  shops: RunnerShopLink[];
  selectedShopIds: string[];
  toggleShop: (id: string) => void;
  queueCapture: () => void;
}) {
  if (props.shops.length === 0) {
    return <EmptyState title="No joined shops" text="Join shops from the web app marketplace first." />;
  }

  return (
    <View style={styles.stack}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Capture from approved shops</Text>
        <Text style={styles.bodyText}>
          Select specific shops, or leave all unchecked to capture from every approved shop.
        </Text>
        <Pressable style={styles.primaryButton} onPress={props.queueCapture}>
          <Text style={styles.primaryButtonText}>
            Queue capture ({props.selectedShopIds.length || 'all'})
          </Text>
        </Pressable>
      </View>

      {props.shops.map((link) => (
        <Pressable
          key={link.id}
          style={[
            styles.card,
            props.selectedShopIds.includes(link.shopId) && styles.selectedCard,
          ]}
          onPress={() => props.toggleShop(link.shopId)}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{link.shop?.name || link.shopId}</Text>
            <Text style={styles.selectPill}>{link.status}</Text>
          </View>
          <Text style={styles.bodyText}>{link.shop?.description || 'WhatsApp shop source'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ProductsTab(props: {
  products: Product[];
  markup: string;
  setMarkup: (value: string) => void;
  addProduct: (product: Product) => void;
}) {
  if (props.products.length === 0) {
    return <EmptyState title="No available products" text="Captured products will appear here after import." />;
  }

  return (
    <View style={styles.stack}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Default markup percent</Text>
        <TextInput
          value={props.markup}
          onChangeText={props.setMarkup}
          keyboardType="numeric"
          style={styles.input}
        />
      </View>

      {props.products.map((product) => {
        const media = mediaForProduct(product);
        const caption = originalCaptionForProduct(product);

        return (
          <View key={product.id} style={styles.card}>
            <Text style={styles.cardTitle}>{product.name}</Text>
            <MediaStrip media={media} />
            <Text style={styles.price}>{formatCurrency(product.basePrice)}</Text>
            <Text style={styles.metaText}>{product.shop?.name || 'WhatsApp shop'}</Text>
            <Text style={styles.captionText} numberOfLines={4}>
              {caption || product.description || 'No caption available.'}
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => props.addProduct(product)}
            >
              <Text style={styles.primaryButtonText}>Add to listings</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function ProfileTab(props: {
  profile: RunnerProfile | null;
  setProfile: (profile: RunnerProfile) => void;
  postingGroup: string;
  setPostingGroup: (value: string) => void;
  saveProfile: () => void;
  logout: () => void;
}) {
  const profile = props.profile;

  if (!profile) {
    return <EmptyState title="Runner profile unavailable" text="Refresh or check login permissions." />;
  }

  const update = (patch: Partial<RunnerProfile>) => {
    props.setProfile({ ...profile, ...patch });
  };

  return (
    <View style={styles.stack}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Runner details</Text>
        <Text style={styles.label}>Phone</Text>
        <TextInput
          value={profile.phone || profile.user?.phone || ''}
          onChangeText={(phone) => update({ phone })}
          style={styles.input}
        />
        <Text style={styles.label}>Service area</Text>
        <TextInput
          value={profile.serviceArea || ''}
          onChangeText={(serviceArea) => update({ serviceArea })}
          style={styles.input}
        />
        <Text style={styles.label}>Vehicle type</Text>
        <TextInput
          value={profile.vehicleType || ''}
          onChangeText={(vehicleType) => update({ vehicleType })}
          style={styles.input}
        />
        <Text style={styles.label}>WhatsApp repost group</Text>
        <TextInput
          value={props.postingGroup}
          onChangeText={props.setPostingGroup}
          style={styles.input}
        />
        <View style={styles.rowBetween}>
          <Text style={styles.bodyText}>Enable auto-posting</Text>
          <Switch
            value={Boolean(profile.autoPostEnabled)}
            onValueChange={(autoPostEnabled) => update({ autoPostEnabled })}
            trackColor={{ true: '#99f6e4', false: '#cbd5e1' }}
            thumbColor={profile.autoPostEnabled ? '#0f766e' : '#f8fafc'}
          />
        </View>
        <Pressable style={styles.primaryButton} onPress={props.saveProfile}>
          <Text style={styles.primaryButtonText}>Save profile</Text>
        </Pressable>
      </View>
      <Pressable style={styles.secondaryButton} onPress={props.logout}>
        <Text style={styles.secondaryButtonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

function Metric(props: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{props.value}</Text>
      <Text style={styles.metricLabel}>{props.label}</Text>
    </View>
  );
}

function MediaStrip(props: { media: string[] }) {
  if (props.media.length === 0) {
    return <View style={styles.mediaPlaceholder}><Text style={styles.metaText}>No media captured</Text></View>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaStrip}>
      {props.media.slice(0, 8).map((url, index) => {
        const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(url);

        return (
          <View key={`${url}-${index}`} style={styles.mediaTile}>
            {isVideo ? (
              <View style={styles.videoTile}>
                <Text style={styles.videoText}>Video</Text>
              </View>
            ) : (
              <Image source={{ uri: url }} style={styles.mediaImage} />
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

function EmptyState(props: { title: string; text: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{props.title}</Text>
      <Text style={styles.bodyText}>{props.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loginContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  loginTitle: {
    color: '#0f172a',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0,
  },
  loginSubtitle: {
    color: '#475569',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 24,
    marginTop: 8,
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomColor: '#e2e8f0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  appName: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0,
  },
  headerSubtext: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 2,
  },
  tabs: {
    backgroundColor: '#ffffff',
    borderBottomColor: '#e2e8f0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
  },
  activeTab: {
    backgroundColor: '#0f766e',
  },
  tabText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  activeTabText: {
    color: '#ffffff',
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  stack: {
    gap: 14,
  },
  panel: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  panelTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 10,
  },
  label: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  passwordRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 46,
  },
  passwordInput: {
    color: '#0f172a',
    flex: 1,
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  passwordToggle: {
    alignItems: 'center',
    borderLeftColor: '#e2e8f0',
    borderLeftWidth: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 12,
  },
  passwordToggleText: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 8,
    minHeight: 46,
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#0f766e',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: '#0f766e',
    fontSize: 14,
    fontWeight: '800',
  },
  ghostButton: {
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ghostButtonText: {
    color: '#0f766e',
    fontWeight: '800',
  },
  dangerButton: {
    borderColor: '#fecaca',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dangerButtonText: {
    color: '#b91c1c',
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.65,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
    marginTop: 12,
  },
  helpText: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  message: {
    backgroundColor: '#ecfdf5',
    borderColor: '#99f6e4',
    borderWidth: 1,
    color: '#115e59',
    fontSize: 13,
    margin: 12,
    marginBottom: 0,
    padding: 10,
    borderRadius: 8,
  },
  busyBar: {
    alignItems: 'center',
    backgroundColor: '#f0fdfa',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  busyText: {
    color: '#0f766e',
    fontWeight: '700',
  },
  bodyText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 21,
  },
  metaText: {
    color: '#64748b',
    fontSize: 13,
  },
  captionText: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  metric: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 12,
  },
  metricValue: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 3,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  selectedCard: {
    borderColor: '#0f766e',
    borderWidth: 2,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitle: {
    color: '#0f172a',
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  selectPill: {
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  price: {
    color: '#047857',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 10,
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  mediaStrip: {
    marginTop: 12,
  },
  mediaTile: {
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    height: 88,
    marginRight: 8,
    overflow: 'hidden',
    width: 88,
  },
  mediaImage: {
    height: '100%',
    width: '100%',
  },
  mediaPlaceholder: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 72,
  },
  videoTile: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    flex: 1,
    justifyContent: 'center',
  },
  videoText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    padding: 24,
  },
  emptyTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
});
