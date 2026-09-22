import NotificationBell from '@/components/notifications/NotificationBell';
import RuleList from '@/components/rules/RuleList';
import CreateRuleDialog from '@/components/rules/CreateRuleDialog';
import ChartWrapper from '@/components/charts/ChartWrapper';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Üst Menü */}
      <header className="border-b bg-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">BIST Kural Motoru</h1>
        <div className="flex items-center gap-4">
          <NotificationBell />
        </div>
      </header>

      {/* Ana İçerik */}
      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-semibold">Aktif Taramalar</h2>
          <CreateRuleDialog />
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Sol Kolon: Kurallar Listesi */}
          <div className="lg:col-span-2">
            <RuleList />
          </div>
          
          {/* Sağ Kolon: Grafik Alanı (Lightweight Charts) */}
          <div className="bg-white p-6 rounded-lg border shadow-sm h-[400px] flex flex-col">
            <h3 className="font-semibold mb-4 text-slate-700">Fiyat Grafiği (Önizleme)</h3>
            <div className="flex-1 w-full">
              <ChartWrapper />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}