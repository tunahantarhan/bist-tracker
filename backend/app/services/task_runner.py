import asyncio
from typing import List, Dict, Any
from sqlalchemy.future import select

# Model, provider ve engine importları (Dizin yapısına göre)
from app.models.rule import Rule
from app.providers.yfinance_provider import YFinanceProvider
from app.services.rule_engine import RuleEngine
from app.services.notification_service import NotificationService
from app.core.database import AsyncSessionLocal
from app.repositories.rule_repository import RuleRepository
from app.core.database import AsyncSessionLocal

class RuleTaskRunner:
    @staticmethod
    async def execute_rule_checks() -> None:
        async with AsyncSessionLocal() as db:
            try:
                # Repository üzerinden aktif kuralları çek
                rule_repo = RuleRepository(db)
                active_rules = await rule_repo.get_active_rules()

                if not active_rules:
                    return

                # API çağrılarını minimize etmek için kuralları sembole göre grupla
                rules_by_symbol: Dict[str, List[Any]] = {}
                for rule in active_rules:
                    if rule.symbol not in rules_by_symbol:
                        rules_by_symbol[rule.symbol] = []
                    rules_by_symbol[rule.symbol].append(rule)

                # Veri sağlayıcıyı başlat
                provider = YFinanceProvider()
                
                # E-posta servisi entegrasyonu tamamlandığında NotificationService'e enjekte edilebilir
                # notification_service = NotificationService(db=db, email_service=...)

                for symbol, rules in rules_by_symbol.items():
                    try:
                        # 2. Asenkron OHLCV verisini çek
                        df = await provider.fetch_historical_data(symbol, period="1mo", interval="1d")

                        # 3. Kural motorunu çalıştır
                        triggered_notifications = RuleEngine.process_symbol_rules(df, rules)

                        # 4. State değişimlerini (last_state) DB'ye yansıt
                        await db.commit()

                        # 5. Bildirimleri gönder
                        if triggered_notifications:
                            for notif in triggered_notifications:
                                print(f"BİLDİRİM TETİKLENDİ: {notif['message']}")
                                # await notification_service.trigger_notification(
                                #     user_id=notif['rule'].user_id,
                                #     rule_id=notif['rule_id'],
                                #     symbol=notif['symbol'],
                                #     message=notif['message']
                                # )

                    except Exception as e:
                        # Belirli bir sembolde hata çıksa bile diğerlerine devam et
                        print(f"[{symbol}] İşleme hatası: {e}")

            except Exception as e:
                print(f"Kural işletiminde kritik hata: {e}")