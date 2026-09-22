'use client';

import { useEffect, useState } from 'react';
import { Rule } from '@/types';
import { fetchRules } from '@/services/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function RuleList() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // API hazır olana kadar hata fırlatmaması için try-catch ile sarıyoruz
    const loadRules = async () => {
      try {
        const data = await fetchRules();
        setRules(data);
      } catch (error) {
        console.error('Kural yükleme hatası:', error);
      } finally {
        setLoading(false);
      }
    };
    loadRules();
  }, []);

  if (loading) return <div className="p-4 text-slate-500">Kurallar yükleniyor...</div>;

  return (
    <div className="rounded-md border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sembol</TableHead>
            <TableHead>İndikatör</TableHead>
            <TableHead>Koşul</TableHead>
            <TableHead>Durum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-slate-500">
                Henüz aktif bir kural bulunmuyor.
              </TableCell>
            </TableRow>
          ) : (
            rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-medium font-mono">{rule.symbol}</TableCell>
                <TableCell>{rule.rule_type}</TableCell>
                <TableCell>{`${rule.operator} ${rule.threshold}`}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded-full text-xs ${rule.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {rule.is_active ? 'Aktif' : 'Pasif'}
                  </span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}