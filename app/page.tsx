"use client";

import { useState } from "react";

interface Review {
  id: string;
  rating: number;
  reviewer: string;
  reviewerUrl: string;
  date: string;
  content: string;
}

interface BookInfo {
  title: string;
  author: string;
  coverUrl: string;
}

interface Pagination {
  currentPage: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextPageToken?: string;
  workId?: string;
  apiKey?: string;
}

interface ReviewsData {
  book: BookInfo | null;
  reviews: Review[];
  totalFiltered: number;
  totalCount?: number;
  pagination: Pagination;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-5 h-5 ${star <= rating ? "text-yellow-400" : "text-gray-300"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReviewsData | null>(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const [bookInfo, setBookInfo] = useState<BookInfo | null>(null);
  const [workId, setWorkId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [pageTokens, setPageTokens] = useState<(string | null)[]>([null]);

  const fetchReviews = async (
    bookUrl: string,
    page: number = 1,
    pageToken?: string | null,
    existingWorkId?: string | null,
    existingApiKey?: string | null
  ) => {
    if (!bookUrl.trim()) return;

    setLoading(true);
    setError(null);

    try {
      let apiUrl = `/api/reviews?url=${encodeURIComponent(bookUrl)}&page=${page}`;
      if (pageToken) {
        apiUrl += `&pageToken=${encodeURIComponent(pageToken)}`;
      }
      if (existingWorkId) {
        apiUrl += `&workId=${encodeURIComponent(existingWorkId)}`;
      }
      if (existingApiKey) {
        apiUrl += `&apiKey=${encodeURIComponent(existingApiKey)}`;
      }

      const response = await fetch(apiUrl);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch reviews");
      }

      // Store book info from first page
      if (result.book) {
        setBookInfo(result.book);
      }

      // Store workId for pagination
      if (result.pagination?.workId) {
        setWorkId(result.pagination.workId);
      }

      // Store apiKey for pagination
      if (result.pagination?.apiKey) {
        setApiKey(result.pagination.apiKey);
      }

      // Store page token for next page
      if (result.pagination?.nextPageToken) {
        setPageTokens((prev) => {
          const newTokens = [...prev];
          newTokens[page] = result.pagination.nextPageToken;
          return newTokens;
        });
      }

      setData(result);
      setCurrentUrl(bookUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setData(null);
    setBookInfo(null);
    setWorkId(null);
    setApiKey(null);
    setPageTokens([null]);
    fetchReviews(url, 1);
  };

  const goToNextPage = () => {
    if (!data) return;
    const nextPage = data.pagination.currentPage + 1;
    const token = data.pagination.nextPageToken;
    fetchReviews(currentUrl, nextPage, token, workId, apiKey);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goToPrevPage = () => {
    if (!data) return;
    const prevPage = data.pagination.currentPage - 1;
    // For previous page, we need the token that was used to get to the current page's previous page
    // This is tricky with cursor pagination - for simplicity, go back to page 1 if needed
    if (prevPage === 1) {
      fetchReviews(currentUrl, 1);
    } else {
      const token = pageTokens[prevPage - 1];
      fetchReviews(currentUrl, prevPage, token, workId, apiKey);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const displayBook = data?.book || bookInfo;

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          Only Good Reads
        </h1>
        <p className="text-lg text-gray-600">
          Skip the negativity. See only 4 and 5 star reviews.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-10">
        <div className="flex gap-3">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a Goodreads book URL..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-gray-900"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Loading..." : "Get Reviews"}
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {data && (
        <div>
          {displayBook && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
              <div className="flex gap-6">
                {displayBook.coverUrl && (
                  <img
                    src={displayBook.coverUrl}
                    alt={displayBook.title}
                    className="w-24 h-36 object-cover rounded-lg shadow"
                  />
                )}
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {displayBook.title}
                  </h2>
                  <p className="text-gray-600">by {displayBook.author}</p>
                </div>
              </div>
            </div>
          )}

          {data.reviews.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No 4 or 5 star reviews found on this page.</p>
              <p className="text-sm mt-2">
                Try another page or visit the book&apos;s reviews page directly
                on Goodreads.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.reviews.map((review) => (
                <article
                  key={review.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <StarRating rating={review.rating} />
                      {review.reviewer && (
                        <span className="text-gray-700 font-medium">
                          {review.reviewerUrl ? (
                            <a
                              href={review.reviewerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-emerald-600"
                            >
                              {review.reviewer}
                            </a>
                          ) : (
                            review.reviewer
                          )}
                        </span>
                      )}
                    </div>
                    {review.date && (
                      <span className="text-sm text-gray-500">
                        {review.date}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {review.content}
                  </p>
                </article>
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={goToPrevPage}
              disabled={!data.pagination.hasPrev || loading}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-gray-600">
              Page {data.pagination.currentPage}
            </span>
            <button
              onClick={goToNextPage}
              disabled={!data.pagination.hasNext || loading}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
