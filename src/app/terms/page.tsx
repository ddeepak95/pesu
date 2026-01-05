import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms & Conditions | ConvoEd",
  description: "Terms and Conditions for ConvoEd - Research Project",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background font-rubik">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 max-w-4xl">
        <div className="mb-8">
          <Link
            href="/"
            className="text-primary hover:underline text-sm text-muted-foreground"
          >
            ← Back to Home
          </Link>
        </div>

        <h1 className="text-4xl font-bold mb-8 text-foreground">
          Terms & Conditions
        </h1>

        <div className="prose prose-lg max-w-none space-y-6 text-foreground">
          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">
              Acceptance of Terms
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing and using ConvoEd, you accept and agree to be bound
              by the terms and provision of this agreement. If you do not agree
              to these terms, please do not use this platform.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">
              Research Project Context
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              ConvoEd is a research project designed to study educational
              outcomes and learning patterns. Your use of this platform
              constitutes participation in this research study. By using
              ConvoEd, you consent to the collection and use of your data as
              described in our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">
              Use of Service
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree to use ConvoEd only for lawful purposes and in a way
              that does not infringe the rights of, restrict, or inhibit anyone
              else&apos;s use and enjoyment of the platform. Prohibited behavior
              includes:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Harassing or abusing other users</li>
              <li>Violating any applicable laws or regulations</li>
              <li>Attempting to gain unauthorized access to the platform</li>
              <li>Interfering with or disrupting the service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">
              Data Collection and Usage
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              As part of this research project, all user input, including text
              and audio recordings, is collected and logged for research
              purposes. All data is deanonymized before use in research. For
              more details, please refer to our{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">
              Intellectual Property
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              The ConvoEd platform, including its design, functionality, and
              content, is the property of the research team. You retain rights
              to your own content, but grant permission for its use in research
              as described in the Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">
              Limitation of Liability
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              ConvoEd is provided &quot;as is&quot; for research purposes. The
              research team makes no warranties, expressed or implied, regarding
              the platform&apos;s availability, accuracy, or suitability for any
              particular purpose. We are not liable for any damages arising from
              your use of the platform.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">
              Data Deletion Requests
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              You may request deletion of your data at any time by contacting us
              at{" "}
              <a
                href="mailto:dv292@cornell.edu"
                className="text-primary hover:underline"
              >
                dv292@cornell.edu
              </a>
              . We will process your request in a reasonable timeframe.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">
              Changes to Terms
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these terms at any time. Your
              continued use of ConvoEd after any changes constitutes acceptance
              of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">
              Contact Information
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              For questions about these Terms & Conditions or to request data
              deletion, please contact:
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Email:{" "}
              <a
                href="mailto:dv292@cornell.edu"
                className="text-primary hover:underline"
              >
                dv292@cornell.edu
              </a>
            </p>
          </section>

          <section>
            <p className="text-sm text-muted-foreground mt-8 pt-6 border-t">
              Last updated: {new Date().toLocaleDateString()}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
