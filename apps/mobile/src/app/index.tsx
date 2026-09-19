import { can, childById, defaultView, displayName, type FamilyChild } from "@summit/family";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  explainEmpty,
  loadCareTeam,
  loadFamily,
  loadUpcomingSessions,
  type CareTeamMember,
  type UpcomingSession,
} from "@/lib/family-data";
import { supabase } from "@/lib/supabase";
import type { Theme } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";

/** "2:30 PM", from the hour and minute columns as the clinic stored them. */
function timeOf(session: UpcomingSession): string {
  if (session.hour == null) return "Time to be confirmed";
  const h = session.hour % 12 === 0 ? 12 : session.hour % 12;
  const m = String(session.minute ?? 0).padStart(2, "0");
  return `${h}:${m} ${session.hour < 12 ? "AM" : "PM"}`;
}

/** "Mon 22 Sep". The date is a plain calendar date, so it is split rather than
 *  passed through Date, which would read it as UTC midnight and shift a day. */
function dayOf(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[dt.getDay()]} ${d} ${months[(m ?? 1) - 1]}`;
}

type State = {
  loading: boolean;
  children: FamilyChild[];
  selected: number | null;
  sessions: UpcomingSession[];
  careTeam: CareTeamMember[];
  problem: string | null;
};

export default function Home() {
  const theme = useTheme();
  const styles = useMemo(() => sheet(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [state, setState] = useState<State>({
    loading: true,
    children: [],
    selected: null,
    sessions: [],
    careTeam: [],
    problem: null,
  });

  const load = useCallback(async (keepSelected: number | null) => {
    const family = await loadFamily();
    if (!family.ok) {
      setState((s) => ({ ...s, loading: false, problem: family.reason }));
      return;
    }

    const view = defaultView(family.value);
    const selected =
      keepSelected != null && family.value.children.some((c) => c.clientId === keepSelected)
        ? keepSelected
        : view.kind === "child"
          ? view.clientId
          : (family.value.children[0]?.clientId ?? null);

    const child = childById(family.value, selected);
    // Only ask for what this parent may have. A refused read comes back empty,
    // so asking anyway would be indistinguishable from an empty schedule.
    const sessions =
      selected != null && can(child, "view_appointments")
        ? await loadUpcomingSessions(selected)
        : { ok: true as const, value: [] as UpcomingSession[] };
    const careTeam = await loadCareTeam();

    setState({
      loading: false,
      children: family.value.children,
      selected,
      sessions: sessions.ok ? sessions.value : [],
      careTeam: careTeam.ok ? careTeam.value : [],
      problem: sessions.ok ? null : sessions.reason,
    });
  }, []);

  useEffect(() => {
    load(null);
  }, [load]);

  const child = useMemo(
    () => state.children.find((c) => c.clientId === state.selected) ?? null,
    [state.children, state.selected],
  );

  const clinician = useMemo(
    () => state.careTeam.find((m) => m.clientId === state.selected) ?? null,
    [state.careTeam, state.selected],
  );

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  if (state.loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  const [next, ...rest] = state.sessions;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.screen, { paddingTop: insets.top + theme.size.space6 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={theme.colors.muted}
          onRefresh={async () => {
            setRefreshing(true);
            await load(state.selected);
            setRefreshing(false);
          }}
        />
      }
    >
      {state.children.length === 0 ? (
        <Notice theme={theme} title="No child linked yet">
          This account is not linked to a child's record. The clinic sets that
          up — contact them and they can link you.
        </Notice>
      ) : (
        <>
          <Text style={styles.greeting}>{child ? displayName(child) : "Your family"}</Text>

          {state.children.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.switcher}>
              {state.children.map((c) => {
                const on = c.clientId === state.selected;
                return (
                  <TouchableOpacity
                    key={c.clientId}
                    style={[styles.pill, on && styles.pillOn]}
                    onPress={() => {
                      setState((s) => ({ ...s, selected: c.clientId, loading: true }));
                      load(c.clientId);
                    }}
                  >
                    <Text style={[styles.pillText, on && styles.pillTextOn]}>{displayName(c)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          {clinician ? (
            <Text style={styles.clinician}>
              Care team: {clinician.name}
              {clinician.jobTitle ? ` · ${clinician.jobTitle}` : ""}
            </Text>
          ) : null}

          <Text style={styles.heading}>Next session</Text>
          {next ? (
            <View style={styles.next}>
              <Text style={styles.nextDay}>{dayOf(next.date)}</Text>
              <Text style={styles.nextTime}>{timeOf(next)}</Text>
              {next.type ? <Text style={styles.nextType}>{next.type}</Text> : null}
              {next.isHomeVisit ? <Text style={styles.tag}>At home</Text> : null}
            </View>
          ) : (
            <Notice theme={theme} title={null}>
              {state.problem ?? explainEmpty(child, "view_appointments", "appointments")}
            </Notice>
          )}

          {rest.length > 0 ? (
            <>
              <Text style={styles.heading}>Also coming up</Text>
              {rest.slice(0, 8).map((s) => (
                <View key={s.id} style={styles.row}>
                  <Text style={styles.rowDay}>{dayOf(s.date)}</Text>
                  <Text style={styles.rowTime}>{timeOf(s)}</Text>
                  <Text style={styles.rowType} numberOfLines={1}>
                    {s.type ?? ""}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
        </>
      )}

      <TouchableOpacity style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Notice({
  theme,
  title,
  children,
}: {
  theme: Theme;
  title: string | null;
  children: React.ReactNode;
}) {
  const styles = useMemo(() => sheet(theme), [theme]);
  return (
    <View style={styles.notice}>
      {title ? <Text style={styles.noticeTitle}>{title}</Text> : null}
      <Text style={styles.noticeBody}>{children}</Text>
    </View>
  );
}

const sheet = (t: Theme) =>
  StyleSheet.create({
    page: { backgroundColor: t.colors.bg },
    screen: { padding: t.size.space6, gap: t.size.space3, paddingBottom: t.size.space12 },
    centre: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.colors.bg,
    },
    greeting: { fontSize: t.size.text3xl, fontWeight: "700", color: t.colors.ink },
    switcher: { marginVertical: t.size.space2 },
    pill: {
      paddingHorizontal: t.size.space4,
      paddingVertical: t.size.space2,
      borderRadius: t.size.radiusFull,
      borderWidth: 1,
      borderColor: t.colors.line,
      marginRight: t.size.space2,
    },
    pillOn: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
    pillText: { color: t.colors.ink, fontSize: t.size.textSm },
    pillTextOn: { color: t.colors.accentInk, fontWeight: "600" },
    clinician: { fontSize: t.size.textSm, color: t.colors.muted },
    heading: {
      fontSize: t.size.textSm,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: t.colors.muted,
      marginTop: t.size.space5,
    },
    next: {
      backgroundColor: t.colors.surface,
      borderRadius: t.size.radiusLg,
      padding: t.size.space5,
      borderWidth: 1,
      borderColor: t.colors.line,
      gap: 2,
    },
    nextDay: { fontSize: t.size.textLg, fontWeight: "600", color: t.colors.ink },
    nextTime: { fontSize: t.size.text2xl, fontWeight: "700", color: t.colors.accent },
    nextType: { fontSize: t.size.textBase, color: t.colors.muted },
    tag: { fontSize: t.size.textXs, color: t.colors.muted, marginTop: t.size.space1 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: t.size.space3,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.line,
      gap: t.size.space3,
    },
    rowDay: { fontSize: t.size.textBase, color: t.colors.ink, width: 96 },
    rowTime: { fontSize: t.size.textBase, color: t.colors.muted, width: 84 },
    rowType: { fontSize: t.size.textBase, color: t.colors.muted, flex: 1 },
    notice: {
      backgroundColor: t.colors.surface2,
      borderRadius: t.size.radiusMd,
      padding: t.size.space4,
      gap: t.size.space1,
    },
    noticeTitle: { fontSize: t.size.textMd, fontWeight: "600", color: t.colors.ink },
    noticeBody: { fontSize: t.size.textBase, lineHeight: 21, color: t.colors.muted },
    signOut: {
      borderWidth: 1,
      borderColor: t.colors.line,
      borderRadius: t.size.radiusMd,
      paddingVertical: t.size.space4,
      alignItems: "center",
      marginTop: t.size.space10,
    },
    signOutText: { fontSize: t.size.textMd, fontWeight: "600", color: t.colors.ink },
  });
