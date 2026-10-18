import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { readListings } from "../../lib/marketplace";
import { AddToMyApps } from "./add-to-my-apps";

export const metadata: Metadata = { title: "MCParrot — Marketplace" };

const publishedDate = (publishedAt: string) => new Date(publishedAt).toLocaleDateString("en-US", { dateStyle: "medium" });

export default async function MarketplacePage() {
  const [{ userId }, listings] = await Promise.all([auth(), readListings()]);
  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <a className="wordmark" href="/" aria-label="MCParrot home">
          <img src="/logo.svg" width={29} height={29} alt="" />
          <span>MCParrot</span>
        </a>
        <nav className="sidebar-footer sidebar-nav" aria-label="Pages">
          <a className="sidebar-link" href="/">Your apps</a>
          <a className="sidebar-link" href="/marketplace" aria-current="page">Marketplace</a>
        </nav>
      </aside>
      <div className="page">
        <div className="topbar"><span>Marketplace</span>{!userId && <a className="button" href="/sign-in?redirect_url=/marketplace">Sign in</a>}</div>
        <main id="main-content">
          <header className="page-header"><div><h1>Marketplace</h1><p>Apps that other people taught MCParrot. Add one to your apps, sign in to the website yourself, and use its tools in ChatGPT.</p></div></header>
          <div className="section-heading"><h2>Published apps <span>{listings.length}</span></h2><span>Logins and sign-ins are never shared</span></div>
          {listings.length === 0 ? <section className="empty-state"><h3>No apps yet</h3><p>Publish an app from its page to share its tools here.</p></section> : <div className="app-list">{listings.map((listing) => <article className="listing-row" id={listing.id} key={listing.id}>
            <span className="app-mark">{listing.name.charAt(0).toUpperCase()}</span>
            <span className="app-main">
              <span className="app-name">{listing.name}{listing.supportsOrdering && <span className="badge">Supports ordering</span>}</span>
              <span className="website-address">{listing.url}</span>
              <span className="website-address">{listing.description}</span>
              <span className="website-address">{listing.taskNames.length} {listing.taskNames.length === 1 ? "tool" : "tools"}: {listing.taskNames.join(", ") || "none"}</span>
              <span className="website-address">Published by {listing.publisher} on {publishedDate(listing.publishedAt)}</span>
            </span>
            <AddToMyApps listingId={listing.id} signedIn={!!userId} />
          </article>)}</div>}
        </main>
      </div>
    </div>
  );
}
