"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useSupabaseClient() {
  const [client] = useState(() => createClient());
  return client;
}

// A short poll interval that runs alongside the Postgres Realtime
// subscription. Realtime pushes changes instantly when it's healthy, but a
// dropped/never-established websocket (which happens silently — no error
// surfaces to the app) would otherwise leave every surface showing stale
// data until a manual refresh. Polling guarantees everyone converges within
// a few seconds regardless, at a trivial cost for this app's scale (one
// venue, one night).
const POLL_MS = 4000;

// Fetches rows from `table` matching `filterColumn = filterValue`, then
// keeps them in sync via Realtime + a polling fallback. Returns the rows
// plus a `refetch` you can call right after your own mutation so the actor
// sees their own change immediately instead of waiting on the network.
export function useTableRows<T>(
  table: string,
  filterColumn: string,
  filterValue: string | null,
  orderBy?: { column: string; ascending?: boolean }
): [T[], () => void] {
  const supabase = useSupabaseClient();
  const [rows, setRows] = useState<T[]>([]);
  const orderColumn = orderBy?.column;
  const orderAscending = orderBy?.ascending ?? true;
  const fetchRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!filterValue) return;
    let cancelled = false;

    async function fetchRows() {
      let query = supabase.from(table).select("*").eq(filterColumn, filterValue as string);
      if (orderColumn) query = query.order(orderColumn, { ascending: orderAscending });
      const { data } = await query;
      if (!cancelled && data) setRows(data as T[]);
    }
    fetchRef.current = fetchRows;

    fetchRows();

    const channel = supabase
      .channel(`${table}:${filterColumn}:${filterValue}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `${filterColumn}=eq.${filterValue}` },
        () => fetchRows()
      )
      .subscribe();

    const interval = setInterval(fetchRows, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [supabase, table, filterColumn, filterValue, orderColumn, orderAscending]);

  const refetch = useCallback(() => fetchRef.current(), []);

  return [filterValue ? rows : [], refetch];
}

// Same idea for a single row keyed by id (used for the `sessions` row,
// which every surface needs live updates for: live flag, now playing,
// venue name, order mode).
export function useTableRow<T>(
  table: string,
  id: string | null,
  initial: T | null,
  idColumn: string = "id"
): [T | null, () => void] {
  const supabase = useSupabaseClient();
  const [row, setRow] = useState<T | null>(initial);
  const [lastId, setLastId] = useState(id);
  const fetchRef = useRef<() => void>(() => {});

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
    fetchRef.current = fetchRow;

    fetchRow();

    const channel = supabase
      .channel(`${table}:${idColumn}:${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `${idColumn}=eq.${id}` },
        () => fetchRow()
      )
      .subscribe();

    const interval = setInterval(fetchRow, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [supabase, table, id, idColumn]);

  const refetch = useCallback(() => fetchRef.current(), []);

  return [row, refetch];
}
