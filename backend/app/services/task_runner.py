import asyncio
from sqlalchemy.future import select
from app.models.universe import UniverseStock
from app.providers.yfinance_provider import YFinanceProvider
from app.services.rule_engine import RuleEngine
from app.core.database import AsyncSessionLocal
from app.repositories.rule_repository import RuleRepository

class RuleTaskRunner:
    @staticmethod
    async def execute_rule_checks() -> None:
        async with AsyncSessionLocal() as db:
            try:
                rule_repo = RuleRepository(db)
                active_rules = await rule_repo.get_active_rules()

                if not active_rules:
                    return

                universe_res = await db.execute(select(UniverseStock).where(UniverseStock.is_active == True))
                active_symbols = [s.symbol for s in universe_res.scalars().all()]
                
                if not active_symbols:
                    return

                provider = YFinanceProvider()

                # For each active stock, run the rules in the background (for cache warming and notifications)
                for symbol in active_symbols:
                    try:
                        df = await provider.fetch_historical_data(symbol, period="6mo", interval="4h")
                        if df.empty:
                            continue
                        
                        # Just checking if it throws an error or triggers a notification, not the actual evaluation result.
                        eval_res = RuleEngine.evaluate_symbol(df, active_rules)
                        
                        # Notification system will be implemented here in the future. 
                        # For now, we just print the evaluation result.
                        # if eval_res["has_primary_filter"] and eval_res["primary_filter_passed"]:
                        #    print(f"[ALARM] {symbol} Ana Filtreyi Geçti!")

                    except Exception as e:
                        print(f"[{symbol}] İşleme hatası: {e}")

            except Exception as e:
                print(f"Kural işletiminde kritik hata: {e}")