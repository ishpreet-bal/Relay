import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer';

/**
 * The proposal PDF.
 *
 * Typeset rather than templated: generous margins, one accent colour, no
 * stock imagery, no gradient banners. The document competes with proposals from
 * firms three times the size, and restraint reads as more expensive than
 * decoration does.
 */

Font.registerHyphenationCallback((word) => [word]); // Disable hyphenation.

const styles = StyleSheet.create({
  page: { paddingTop: 56, paddingBottom: 64, paddingHorizontal: 56, fontSize: 10, color: '#1B2437', fontFamily: 'Helvetica', lineHeight: 1.5 },
  eyebrow: { fontSize: 7.5, letterSpacing: 1.2, color: '#6B7A93', textTransform: 'uppercase', marginBottom: 6 },
  h1: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 6, lineHeight: 1.2 },
  h2: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 8, marginTop: 22 },
  muted: { color: '#6B7A93' },
  rule: { borderBottomWidth: 0.75, borderBottomColor: '#D8DEE8', marginVertical: 14 },
  row: { flexDirection: 'row' },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  cardRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  card: { flex: 1, borderWidth: 0.75, borderColor: '#D8DEE8', borderRadius: 4, padding: 10 },
  statValue: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  statLabel: { fontSize: 7.5, color: '#6B7A93', textTransform: 'uppercase', letterSpacing: 0.8 },
  th: { fontSize: 7.5, color: '#6B7A93', textTransform: 'uppercase', letterSpacing: 0.8, paddingBottom: 6 },
  td: { fontSize: 9.5, paddingVertical: 6 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#E6EAF1' },
  bullet: { flexDirection: 'row', marginBottom: 3 },
  footer: { position: 'absolute', bottom: 32, left: 56, right: 56, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: '#8A98AF' },
  quote: { fontSize: 8, color: '#6B7A93', fontStyle: 'italic', marginTop: 3, paddingLeft: 8, borderLeftWidth: 1.5, borderLeftColor: '#D8DEE8' },
});

export interface ProposalPdfData {
  number: string;
  title: string;
  agencyName: string;
  accentColor: string;
  clientName: string;
  clientCity: string | null;
  preparedOn: string;
  validUntil: string | null;
  currency: string;
  scope: Array<{ phase: string; deliverables: string[]; days: number; weeks: number }>;
  lineItems: Array<{ label: string; detail?: string; qty: number; unitCents: number; recurring: boolean }>;
  subtotalCents: number;
  recurringMonthlyCents: number;
  roi: {
    hoursSavedPerMonth: number;
    annualSavingsCents: number;
    paybackMonths: number | null;
    assumptions: { note: string };
    evidence: Array<{ opportunity: string; url: string; quote: string }>;
  };
  timeline: { totalWeeks: number };
  terms: string | null;
}

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);

export function ProposalDocument({ data }: { data: ProposalPdfData }) {
  const accent = data.accentColor;

  return (
    <Document title={`${data.title} — ${data.number}`} author={data.agencyName}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.between}>
          <Text style={[styles.eyebrow, { color: accent }]}>{data.agencyName}</Text>
          <Text style={styles.eyebrow}>Proposal {data.number}</Text>
        </View>

        <Text style={styles.h1}>{data.title}</Text>
        <Text style={styles.muted}>
          Prepared for {data.clientName}{data.clientCity ? `, ${data.clientCity}` : ''} · {data.preparedOn}
        </Text>

        <View style={styles.rule} />

        {/* The three numbers a prospect actually decides on. */}
        <View style={styles.cardRow}>
          <View style={styles.card}>
            <Text style={styles.statLabel}>Investment</Text>
            <Text style={[styles.statValue, { color: accent }]}>{money(data.subtotalCents, data.currency)}</Text>
            {data.recurringMonthlyCents > 0 && (
              <Text style={[styles.muted, { fontSize: 8 }]}>
                plus {money(data.recurringMonthlyCents, data.currency)}/month support
              </Text>
            )}
          </View>
          <View style={styles.card}>
            <Text style={styles.statLabel}>Estimated annual saving</Text>
            <Text style={styles.statValue}>{money(data.roi.annualSavingsCents, data.currency)}</Text>
            <Text style={[styles.muted, { fontSize: 8 }]}>{data.roi.hoursSavedPerMonth} hours a month</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.statLabel}>Payback</Text>
            <Text style={styles.statValue}>
              {data.roi.paybackMonths ? `${data.roi.paybackMonths} months` : '—'}
            </Text>
            <Text style={[styles.muted, { fontSize: 8 }]}>{data.timeline.totalWeeks} weeks to deliver</Text>
          </View>
        </View>

        <Text style={styles.h2}>What we would build</Text>
        {data.scope.map((phase, i) => (
          <View key={i} style={{ marginBottom: 10 }} wrap={false}>
            <View style={styles.between}>
              <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10 }}>{phase.phase}</Text>
              <Text style={[styles.muted, { fontSize: 8.5 }]}>
                {phase.days} days · about {phase.weeks} week{phase.weeks > 1 ? 's' : ''}
              </Text>
            </View>
            {phase.deliverables.map((d, j) => (
              <View key={j} style={styles.bullet}>
                <Text style={{ color: accent, marginRight: 6 }}>·</Text>
                <Text style={{ flex: 1 }}>{d}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>{data.agencyName}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`} />
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Text style={styles.h2}>Investment</Text>
        <View style={styles.tableRow}>
          <Text style={[styles.th, { flex: 4 }]}>Item</Text>
          <Text style={[styles.th, { width: 44, textAlign: 'right' }]}>Days</Text>
          <Text style={[styles.th, { width: 70, textAlign: 'right' }]}>Rate</Text>
          <Text style={[styles.th, { width: 80, textAlign: 'right' }]}>Amount</Text>
        </View>

        {data.lineItems.map((item, i) => (
          <View key={i} style={styles.tableRow} wrap={false}>
            <View style={{ flex: 4, paddingRight: 8 }}>
              <Text style={styles.td}>{item.label}</Text>
              {item.detail && (
                <Text style={[styles.muted, { fontSize: 8, marginTop: -4, marginBottom: 6 }]}>{item.detail}</Text>
              )}
            </View>
            <Text style={[styles.td, { width: 44, textAlign: 'right' }]}>{item.recurring ? '—' : item.qty}</Text>
            <Text style={[styles.td, { width: 70, textAlign: 'right' }]}>{money(item.unitCents, data.currency)}</Text>
            <Text style={[styles.td, { width: 80, textAlign: 'right' }]}>
              {money(item.qty * item.unitCents, data.currency)}{item.recurring ? '/mo' : ''}
            </Text>
          </View>
        ))}

        <View style={[styles.between, { marginTop: 12 }]}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Project total</Text>
          <Text style={{ fontFamily: 'Helvetica-Bold', color: accent }}>
            {money(data.subtotalCents, data.currency)}
          </Text>
        </View>
        {data.recurringMonthlyCents > 0 && (
          <View style={styles.between}>
            <Text style={styles.muted}>Ongoing support, monthly</Text>
            <Text style={styles.muted}>{money(data.recurringMonthlyCents, data.currency)}</Text>
          </View>
        )}

        <Text style={styles.h2}>How the estimate was calculated</Text>
        <Text style={styles.muted}>{data.roi.assumptions.note}</Text>

        {data.roi.evidence.length > 0 && (
          <>
            <Text style={styles.h2}>What this is based on</Text>
            <Text style={[styles.muted, { marginBottom: 8 }]}>
              Every opportunity below was identified from your own website. The quoted
              text is what we read.
            </Text>
            {data.roi.evidence.slice(0, 6).map((e, i) => (
              <View key={i} style={{ marginBottom: 8 }} wrap={false}>
                <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold' }}>{e.opportunity}</Text>
                <Text style={styles.quote}>“{e.quote}”</Text>
                <Text style={[styles.muted, { fontSize: 7.5, marginTop: 2 }]}>{e.url}</Text>
              </View>
            ))}
          </>
        )}

        {data.terms && (
          <>
            <Text style={styles.h2}>Terms</Text>
            <Text style={styles.muted}>{data.terms}</Text>
          </>
        )}

        {data.validUntil && (
          <Text style={[styles.muted, { marginTop: 18, fontSize: 8.5 }]}>
            This proposal is valid until {data.validUntil}.
          </Text>
        )}

        <View style={styles.footer} fixed>
          <Text>{data.agencyName}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
