import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | ConvoEd",
  description: "Privacy Policy for ConvoEd - Research Project",
};

export default function PrivacyPolicyPage() {
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
          Privacy Policy
        </h1>

        <div className="prose prose-lg max-w-none space-y-6 text-foreground">
          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">
              Research Project Disclosure
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              ConvoEd is a research project conducted for academic purposes. By
              using this platform, you acknowledge that your participation
              contributes to educational research.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">
              Data Collection and Logging
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              All user input, including but not limited to text, audio
              recordings, and interaction data, is logged for research purposes.
              This data helps us understand how students learn and improve the
              educational experience.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">
              Data Anonymization
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              All collected data is deanonymized before being used for research
              purposes. Personal identifiers are removed or replaced with
              pseudonyms to protect your privacy while allowing meaningful
              research analysis.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">
              Data Usage
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              The collected data may be used for:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Academic research and publications</li>
              <li>Improving the ConvoEd platform</li>
              <li>Understanding learning patterns and outcomes</li>
              <li>Educational research presentations and conferences</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">
              Your Rights
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              You have the right to request deletion of your data at any time.
              To request data deletion, please contact us at{" "}
              <a
                href="mailto:dv292@cornell.edu"
                className="text-primary hover:underline"
              >
                dv292@cornell.edu
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">
              Contact Information
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about this Privacy Policy or wish to
              request data deletion, please contact:
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

