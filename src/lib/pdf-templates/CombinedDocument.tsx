import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";

// Times-Roman and Times-Bold are standard PDF fonts; no need to register
const styles = StyleSheet.create({
  page: {
    paddingTop: 72,
    paddingBottom: 72,
    paddingLeft: 72,
    paddingRight: 72,
    fontFamily: "Times-Roman",
    fontSize: 12,
  },
  letterhead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  letterheadBrand: {
    fontFamily: "Times-Bold",
    fontSize: 14,
    color: "#1a1a1a",
  },
  letterheadDate: {
    fontSize: 10,
    color: "#4a4a4a",
  },
  title: {
    fontFamily: "Times-Bold",
    fontSize: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: "Times-Bold",
    fontSize: 14,
    marginTop: 20,
    marginBottom: 12,
  },
  headerBlock: {
    fontSize: 12,
    lineHeight: 1.5,
    marginBottom: 20,
    whiteSpace: "pre",
  },
  coverBody: {
    fontSize: 12,
    lineHeight: 1.6,
    textAlign: "justify",
    marginBottom: 20,
  },
  body: {
    fontSize: 12,
    lineHeight: 1.6,
    textAlign: "justify",
    marginBottom: 14,
  },
  financialSection: {
    marginTop: 16,
    marginBottom: 16,
  },
  financialTitle: {
    fontFamily: "Times-Bold",
    fontSize: 12,
    marginBottom: 8,
  },
  financialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingLeft: 20,
  },
  financialRowBold: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingLeft: 20,
    fontFamily: "Times-Bold",
  },
  financialLabel: {
    flex: 1,
  },
  financialValue: {
    flexShrink: 0,
  },
  signatureBlock: {
    marginTop: 32,
    marginBottom: 16,
  },
  signatureLine: {
    width: 200,
    borderBottomWidth: 0.5,
    borderBottomColor: "#000",
    marginBottom: 4,
  },
  signatureLabel: {
    fontSize: 10,
    color: "#4a4a4a",
  },
  exhibitItem: {
    fontSize: 12,
    lineHeight: 1.5,
    marginBottom: 8,
    paddingLeft: 8,
  },
});

export interface FinancialData {
  financialRequirements?: {
    tuition?: string;
    livingExpenses?: string;
    totalRequired?: string;
  };
  availableResources?: {
    personalFunds?: string;
    sponsorName?: string;
    sponsorAmount?: string;
    totalAvailable?: string;
  };
}

export interface PageContent {
  letterhead?: boolean;
  letterheadTitle?: string;
  coverTitle?: boolean;
  coverHeader?: string;
  coverBody?: string[];
  financial?: FinancialData;
  personalHeading?: boolean;
  personalParagraphs?: string[];
  signature?: string;
  exhibitHeading?: boolean;
  exhibitItems?: string[];
}

interface CombinedDocumentProps {
  pages: PageContent[];
}

function FinancialBlock({ data }: { data: FinancialData }) {
  const req = data.financialRequirements;
  const res = data.availableResources;
  return (
    <View style={styles.financialSection}>
      {req && (req.tuition || req.livingExpenses || req.totalRequired) && (
          <>
            <Text style={styles.financialTitle}>Financial Requirements:</Text>
            {req.tuition && (
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>Tuition:</Text>
                <Text style={styles.financialValue}>USD ${req.tuition}</Text>
              </View>
            )}
            {req.livingExpenses && (
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>Living Expenses:</Text>
                <Text style={styles.financialValue}>USD ${req.livingExpenses}</Text>
              </View>
            )}
            {req.totalRequired && (
              <View style={styles.financialRowBold}>
                <Text style={styles.financialLabel}>Total Required:</Text>
                <Text style={styles.financialValue}>USD ${req.totalRequired}</Text>
              </View>
            )}
          </>
        )}
      {res && (res.personalFunds !== undefined || res.sponsorName || res.totalAvailable) && (
        <>
          <Text style={[styles.financialTitle, { marginTop: 12 }]}>
            Available Financial Resources:
          </Text>
          {res.personalFunds !== undefined && (
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Personal funds:</Text>
              <Text style={styles.financialValue}>USD ${res.personalFunds}</Text>
            </View>
          )}
          {res.sponsorName && res.sponsorAmount && (
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>
                Financial sponsorship by {res.sponsorName}:
              </Text>
              <Text style={styles.financialValue}>USD ${res.sponsorAmount}</Text>
            </View>
          )}
          {res.totalAvailable && (
            <View style={styles.financialRowBold}>
              <Text style={styles.financialLabel}>Total Available:</Text>
              <Text style={styles.financialValue}>USD ${res.totalAvailable}</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function PageContentRenderer({ p }: { p: PageContent }) {
  return (
    <View style={styles.page}>
      {p.letterhead && (
        <View style={styles.letterhead}>
          <Text style={styles.letterheadBrand}>{p.letterheadTitle ?? "DocAI"}</Text>
        </View>
      )}
      {p.coverTitle && p.letterheadTitle !== "COVER LETTER" && (
        <Text style={styles.title}>COVER LETTER</Text>
      )}
      {p.coverHeader && (
        <Text style={styles.headerBlock}>{p.coverHeader}</Text>
      )}
      {p.coverBody &&
        p.coverBody.map((para, i) => (
          <Text key={i} style={styles.coverBody}>
            {para}
          </Text>
        ))}
      {p.financial && <FinancialBlock data={p.financial} />}
      {p.personalHeading && p.letterheadTitle !== "PERSONAL STATEMENT" && (
        <Text style={styles.sectionTitle}>PERSONAL STATEMENT</Text>
      )}
      {p.personalParagraphs &&
        p.personalParagraphs.map((para, i) => (
          <Text key={i} style={styles.body}>
            {para}
          </Text>
        ))}
      {p.signature && (
        <View style={styles.signatureBlock}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>Signature</Text>
        </View>
      )}
      {p.exhibitHeading && (
        <Text style={styles.sectionTitle}>EXHIBIT LIST</Text>
      )}
      {p.exhibitItems &&
        p.exhibitItems.map((item, i) => (
          <Text key={i} style={styles.exhibitItem}>
            {item}
          </Text>
        ))}
    </View>
  );
}

export function CombinedDocument({ pages }: CombinedDocumentProps) {
  return (
    <Document>
      {pages.map((p, i) => (
        <Page key={i} size="LETTER">
          <PageContentRenderer p={p} />
        </Page>
      ))}
    </Document>
  );
}
