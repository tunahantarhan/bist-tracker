'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import CreateRuleDialog from '@/components/rules/CreateRuleDialog';
import AdminShell, { SECTION_HASH, sectionFromHash, type AdminSection } from '@/components/admin/AdminShell';
import { FeedbackProvider, useFeedback } from '@/components/ui/feedback';
import OverviewSection from '@/components/admin/OverviewSection';
import { PrimaryFilterCard, RulePreview, ScoringRules, WeightBalance } from '@/components/admin/RulesSection';
import UsersSection from '@/components/admin/UsersSection';
import UniverseSection from '@/components/admin/UniverseSection';
import {
  deleteRule,
  fetchActiveUniverse,
  fetchAdminStats,
  fetchAdminUsers,
  fetchMarketData,
  fetchMarketOverview,
  fetchMe,
  fetchRules,
  fetchUniverse,
  resetAdminUser2fa,
  seedDefaultRules,
  updateActiveUniverse,
  updateAdminUser,
  updateRule,
  type AdminStats,
  type AdminUserItem,
  type MarketData,
  type MarketOverviewResponse,
} from '@/services/api';
import type { Rule } from '@/types';
import { getAccessToken, isAdminSession } from '@/lib/auth';

const noopSubscribe = () => () => {};

const HEADINGS: Record<AdminSection, { title: string; subtitle: string }> = {
  overview: { title: 'Genel bakış', subtitle: 'Platformun anlık durumu ve dikkat isteyen konular' },
  rules: { title: 'Kural motoru', subtitle: 'Ana filtre, puanlama kuralları ve ağırlıklar' },
  users: { title: 'Kullanıcılar', subtitle: 'Paketler, hesap erişimi ve yönetici güvenliği' },
  universe: { title: 'Hisse evreni', subtitle: 'Arka planda taranacak BIST hisseleri' },
};

function AdminConsole() {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const authorized = useSyncExternalStore(noopSubscribe, () => !!getAccessToken() && isAdminSession(), () => false);

  const [section, setSection] = useState<AdminSection>(() => (typeof window === 'undefined' ? 'overview' : sectionFromHash(window.location.hash)));

  const [me, setMe] = useState<{ firstName: string | null; email: string | null }>({ firstName: null, email: null });
  const [stats, setStats] = useState<AdminStats>({ total_users: 0, active_stocks: 0, active_rules: 0 });
  const [overview, setOverview] = useState<MarketOverviewResponse | null>(null);

  const [rules, setRules] = useState<Rule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [seeding, setSeeding] = useState(false);

  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);

  const [catalog, setCatalog] = useState<{ symbol: string; name: string }[]>([]);
  const [savedUniverse, setSavedUniverse] = useState<string[]>([]);
  const [draftUniverse, setDraftUniverse] = useState<string[]>([]);
  const [savingUniverse, setSavingUniverse] = useState(false);

  const [previewSymbol, setPreviewSymbol] = useState('GARAN');
  const [previewConfig, setPreviewConfig] = useState({ interval: '4h', period: '6mo' });
  const [previewData, setPreviewData] = useState<MarketData | null>(null);
  const [loadedPreviewKey, setLoadedPreviewKey] = useState<string | null>(null);

  const loadRules = useCallback(() => fetchRules().then(setRules).catch(() => toast('Kurallar alınamadı.', 'error')), [toast]);
  const loadStats = useCallback(() => fetchAdminStats().then(setStats).catch(() => {}), []);

  useEffect(() => {
    // The panel requires an admin-scoped session (password + 2FA via /admin/giris)
    if (!getAccessToken() || !isAdminSession()) {
      router.replace('/admin/giris');
      return;
    }
    fetchRules()
      .then(setRules)
      .catch(() => {})
      .finally(() => setRulesLoading(false));
    fetchAdminStats().then(setStats).catch(() => {});
    fetchMe()
      .then((p) => setMe({ firstName: p.first_name, email: p.email }))
      .catch(() => {});
    fetchAdminUsers()
      .then(setUsers)
      .catch(() => {})
      .finally(() => setUsersLoaded(true));
    fetchMarketOverview().then(setOverview).catch(() => {});
    // Catalog drives the selectable tiles; the DB universe drives which ones are selected
    Promise.all([fetchUniverse(), fetchActiveUniverse()])
      .then(([cat, active]) => {
        setCatalog(cat);
        setSavedUniverse(active);
        setDraftUniverse(active);
      })
      .catch(() => {});
  }, [router]);

  // Back/forward between sections
  useEffect(() => {
    const onHash = () => setSection(sectionFromHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Rule preview: reloads when the symbol, chart settings or the rules change
  useEffect(() => {
    if (section !== 'rules' || !authorized) return;
    const controller = new AbortController();
    const key = `${previewSymbol}-${previewConfig.interval}-${previewConfig.period}`;
    fetchMarketData(previewSymbol, previewConfig.interval, previewConfig.period, controller.signal)
      .then(setPreviewData)
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoadedPreviewKey(key);
      });
    return () => controller.abort();
  }, [section, authorized, previewSymbol, previewConfig, rules]);

  const navigate = (s: AdminSection) => {
    setSection(s);
    const hash = SECTION_HASH[s];
    window.history.replaceState(null, '', hash ? `#${hash}` : window.location.pathname);
    window.scrollTo({ top: 0 });
  };

  const afterRuleChange = () => {
    loadRules();
    loadStats();
  };

  const handleToggleRule = async (id: number, isActive: boolean) => {
    // Optimistic; the reload reverts it if the request fails
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: isActive } : r)));
    try {
      await updateRule(id, { is_active: isActive });
      toast(isActive ? 'Kural aktifleştirildi.' : 'Kural devre dışı bırakıldı.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Kural güncellenemedi.', 'error');
    } finally {
      afterRuleChange();
    }
  };

  const handleDeleteRules = async (ids: number[]) => {
    try {
      await Promise.all(ids.map((id) => deleteRule(id)));
      toast(ids.length > 1 ? `${ids.length} kural silindi.` : 'Kural silindi.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Kural silinemedi.', 'error');
    } finally {
      afterRuleChange();
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const created = await seedDefaultRules();
      toast(created.length ? `${created.length} varsayılan kural eklendi.` : 'Varsayılan kuralların hepsi zaten mevcut.', created.length ? 'success' : 'info');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Varsayılan kurallar eklenemedi.', 'error');
    } finally {
      setSeeding(false);
      afterRuleChange();
    }
  };

  const handleTier = async (user: AdminUserItem, tier: AdminUserItem['tier']) => {
    setBusyUserId(user.id);
    try {
      await updateAdminUser(user.id, { tier });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, tier } : u)));
      toast(`${user.email} paketi güncellendi.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Kullanıcı güncellenemedi.', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleToggleActive = async (user: AdminUserItem) => {
    const suspend = user.is_active;
    const ok = await confirm(
      suspend
        ? {
            title: 'Hesap askıya alınsın mı?',
            message: `${user.email} giriş yapamaz, bildirim alamaz ve açık oturumları hemen kapanır.`,
            confirmLabel: 'Askıya al',
            tone: 'danger',
          }
        : { title: 'Hesap aktifleştirilsin mi?', message: `${user.email} yeniden giriş yapabilecek.`, confirmLabel: 'Aktifleştir' }
    );
    if (!ok) return;
    setBusyUserId(user.id);
    try {
      const res = await updateAdminUser(user.id, { is_active: !suspend });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? res.user : u)));
      toast(suspend ? 'Hesap askıya alındı.' : 'Hesap aktifleştirildi.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Kullanıcı güncellenemedi.', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleReset2fa = async (user: AdminUserItem) => {
    const ok = await confirm({
      title: 'İki adımlı doğrulama sıfırlansın mı?',
      message: `${user.email} hesabının açık oturumları kapanır ve bir sonraki yönetici girişinde doğrulama uygulamasını yeniden kurar.`,
      confirmLabel: 'Sıfırla',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyUserId(user.id);
    try {
      const res = await resetAdminUser2fa(user.id);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? res.user : u)));
      toast('İki adımlı doğrulama sıfırlandı.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'İki adımlı doğrulama sıfırlanamadı.', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleSaveUniverse = async () => {
    setSavingUniverse(true);
    try {
      await updateActiveUniverse(draftUniverse);
      setSavedUniverse(draftUniverse);
      loadStats();
      toast(`Hisse evreni kaydedildi: ${draftUniverse.length} hisse.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Hisse evreni kaydedilemedi.', 'error');
    } finally {
      setSavingUniverse(false);
    }
  };

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0e14]">
        <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
      </div>
    );
  }

  const primaryRule = rules.find((r) => r.is_primary_filter) ?? null;
  const scoringRules = rules.filter((r) => !r.is_primary_filter);
  const heading = HEADINGS[section];

  return (
    <AdminShell
      section={section}
      onNavigate={navigate}
      counts={{ rules: rules.length, users: usersLoaded ? users.length : stats.total_users, stocks: savedUniverse.length || stats.active_stocks }}
      title={heading.title}
      subtitle={heading.subtitle}
      actions={section === 'rules' ? <CreateRuleDialog onRuleCreated={() => { afterRuleChange(); toast('Kural kaydedildi.'); }} /> : undefined}
    >
      {/* Shared edit dialog for the primary filter and scoring rules */}
      <CreateRuleDialog
        isOpen={editingRule !== null}
        onOpenChange={(open) => {
          if (!open) setEditingRule(null);
        }}
        editingRule={editingRule}
        onRuleCreated={() => {
          afterRuleChange();
          toast('Kural güncellendi.');
        }}
      />

      <div className="mx-auto max-w-[1400px]">
        {section === 'overview' && (
          <OverviewSection
            firstName={me.firstName}
            rules={rules}
            users={users}
            usersLoaded={usersLoaded}
            overview={overview}
            activeStocks={savedUniverse.length || stats.active_stocks}
            onNavigate={navigate}
          />
        )}

        {section === 'rules' &&
          (rulesLoading ? (
            <div className="flex h-64 items-center justify-center gap-2 font-data text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Kurallar yükleniyor
            </div>
          ) : (
            <div className="space-y-6">
              <WeightBalance rules={rules} />
              <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                <div className="space-y-6">
                  {primaryRule && <PrimaryFilterCard rule={primaryRule} onEdit={setEditingRule} onToggle={handleToggleRule} />}
                  <ScoringRules
                    rules={scoringRules}
                    onEdit={setEditingRule}
                    onToggle={handleToggleRule}
                    onDelete={handleDeleteRules}
                    onSeed={handleSeed}
                    seeding={seeding}
                  />
                </div>
                <div className="xl:sticky xl:top-24">
                  <RulePreview
                    universe={catalog}
                    symbol={previewSymbol}
                    onSymbol={setPreviewSymbol}
                    config={previewConfig}
                    onConfig={setPreviewConfig}
                    data={previewData && previewData.symbol === previewSymbol ? previewData : null}
                    loading={loadedPreviewKey !== `${previewSymbol}-${previewConfig.interval}-${previewConfig.period}`}
                  />
                </div>
              </div>
            </div>
          ))}

        {section === 'users' && (
          <UsersSection
            users={users}
            loading={!usersLoaded}
            busyId={busyUserId}
            currentEmail={me.email}
            onTier={handleTier}
            onToggleActive={handleToggleActive}
            onReset2fa={handleReset2fa}
          />
        )}

        {section === 'universe' && (
          <UniverseSection
            catalog={catalog}
            saved={savedUniverse}
            draft={draftUniverse}
            onDraft={setDraftUniverse}
            onSave={handleSaveUniverse}
            saving={savingUniverse}
          />
        )}
      </div>
    </AdminShell>
  );
}

export default function AdminPage() {
  return (
    <FeedbackProvider>
      <AdminConsole />
    </FeedbackProvider>
  );
}
