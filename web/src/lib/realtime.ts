"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useSupabaseClient() {
  const [client] = useState(() => createClient());
  return client;
}

// Fetches rows from `table` matching `filterColumn = filterValue`, then
// keeps them in sync by refetching whenever Postgres Realtime reports any
// change on that table for this session. A wholesale refetch (rather than
// patching individual rows) keeps this simple and correct — request/queue
// volumes here are small (one venue, one night).
export function useTableRows<T>(
  table: string,
  filterColumn: string,
  filterValue: string | null,
  orderBy?: { column: string; ascending?: boolean }
): T[] {
  const supabase = useSupabaseClient();
  const [rows, setRows] = useState<T[]>([]);
  const orderColumn = orderBy?.column;
  const orderAscending = orderBy?.ascending ?? true;

  useEffect(() => {
    if (!filterValue) return;
    let cancelled = false;

    async function fetchRows() {
      let query = supabase.from(table).select("*").eq(filterColumn, filterValue as string);
      if (orderColumn) query = query.order(orderColumn, { ascending: orderAscending });
      const { data } = await query;
      if (!cancelled && data) setRows(data as T[]);
    }

    fetchRows();

    const channel = supabase
      .channel(`${table}:${filterColumn}:${filterValue}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `${filterColumn}=eq.${filterValue}` },
        () => fetchRows()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, table, filterColumn, filterValue, orderColumn, orderAscending]);

  return filterValue ? rows : [];
}

// Same idea for a single row keyed by id (used for the `sessions` row,
// which every surface needs live updates for: live flag, now playing,
// venue name, order mode).
export function useTableRow<T>(
  table: string,
  id: string | null,
  initial: T | null,
  idColumn: string = "id"
): T | null {
  const supabase = useSupabaseClient();
  const [row, setRow] = useState<T | null>(initial);
  const [lastId, setLastId] = useState(id);

  // Resets to the caller's snapshot when we start watching a different row
  // (e.g. the booth opens a new session after "End session"), computed
  // during render rather than in an effect — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (id !== lastId) {
    setLastId(id);
    setRow(initial);
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function fetchRow() {
      const { data } = await supabase.from(table).select("*").eq(idColumn, id as string).maybeSingle();
      if (!cancelled && data) setRow(data as T);
    }

    fetchRow();

    const channel = supabase
      .channel(`${table}:${idColumn}:${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `${idColumn}=eq.${id}` },
        () => fetchRow()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, table, id, idColumn]);

  return row;
}
