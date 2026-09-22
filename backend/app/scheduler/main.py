from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.services.task_runner import RuleTaskRunner

scheduler = AsyncIOScheduler()

def start_scheduler():
    # 15 dakikada bir çalışacak ana değerlendirme görevi
    scheduler.add_job(
        RuleTaskRunner.execute_rule_checks, 
        'interval', 
        minutes=15,
        id="rule_evaluation_job",
        replace_existing=True
    )
    scheduler.start()
    print("Arka plan zamanlayıcısı (APScheduler) başlatıldı.")