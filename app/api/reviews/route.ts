import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

const GRAPHQL_ENDPOINT =
  "https://kxbwmqov6jgg3daaamb744ycu4.appsync-api.us-east-1.amazonaws.com/graphql";

// Fallback API key - will be overridden by extracting from page
const FALLBACK_API_KEY = "da2-xpgsdydkbregjhpr6ejzqdhuwy";

const REVIEWS_QUERY = `
query getReviews($filters: BookReviewsFilterInput!, $pagination: PaginationInput) {
  getReviews(filters: $filters, pagination: $pagination) {
    totalCount
    edges {
      node {
        id
        text
        rating
        createdAt
        creator {
          id: legacyId
          name
          webUrl
        }
      }
    }
    pageInfo {
      prevPageToken
      nextPageToken
    }
  }
}
`;

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

interface GraphQLReview {
  id: string;
  text: string;
  rating: number;
  createdAt: number;
  creator: {
    id: string;
    name: string;
    webUrl: string;
  };
}

async function fetchBookPageData(url: string): Promise<{
  workId: string;
  bookInfo: BookInfo;
  initialReviews: Review[];
  nextPageToken: string | null;
  totalCount: number;
  apiKey: string;
} | null> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });

  if (!response.ok) return null;

  const html = await response.text();
  const $ = cheerio.load(html);

  // Extract __NEXT_DATA__ JSON
  const nextDataScript = $("#__NEXT_DATA__").html();
  if (!nextDataScript) return null;

  try {
    const nextData = JSON.parse(nextDataScript);
    const apolloState = nextData?.props?.pageProps?.apolloState;
    if (!apolloState) return null;

    // Extract API key from the page - search in scripts for the AppSync key pattern
    let apiKey = FALLBACK_API_KEY;
    const scriptTags = $("script").toArray();
    for (const script of scriptTags) {
      const scriptContent = $(script).html() || "";
      // Look for the da2- pattern which is AWS AppSync API key format
      const apiKeyMatch = scriptContent.match(/["']?(da2-[a-z0-9]+)["']?/i);
      if (apiKeyMatch) {
        apiKey = apiKeyMatch[1];
        break;
      }
    }
    // Also check in __NEXT_DATA__ for any config
    const runtimeConfig = nextData?.runtimeConfig || nextData?.props?.pageProps?.runtimeConfig;
    if (runtimeConfig?.apiKey) {
      apiKey = runtimeConfig.apiKey;
    }

    // Find work ID
    const workKey = Object.keys(apolloState).find((k) =>
      k.startsWith("Work:kca://work/")
    );
    if (!workKey) return null;
    const workId = workKey.replace("Work:", "");

    // Extract book info
    const bookKeys = Object.keys(apolloState).filter((k) =>
      k.startsWith("Book:")
    );
    let bookInfo: BookInfo = {
      title: "Unknown Title",
      author: "Unknown Author",
      coverUrl: "",
    };

    if (bookKeys.length > 0) {
      const book = apolloState[bookKeys[0]];
      bookInfo.title = book?.title || "Unknown Title";
      bookInfo.coverUrl = book?.imageUrl || "";

      // Find author
      if (book?.primaryContributorEdge?.__ref) {
        const contribKey = book.primaryContributorEdge.__ref;
        const contrib = apolloState[contribKey];
        if (contrib?.node?.__ref) {
          const authorData = apolloState[contrib.node.__ref];
          bookInfo.author = authorData?.name || "Unknown Author";
        }
      }
    }

    // Extract initial reviews from apolloState
    const reviews: Review[] = [];
    const reviewKeys = Object.keys(apolloState).filter((k) =>
      k.startsWith("Review:")
    );

    for (const key of reviewKeys) {
      const review = apolloState[key];
      if (review && review.rating >= 4) {
        let reviewerName = "Anonymous";
        let reviewerUrl = "";

        if (review.creator?.__ref) {
          const userData = apolloState[review.creator.__ref];
          if (userData) {
            reviewerName = userData.name || "Anonymous";
            reviewerUrl = userData.webUrl || "";
          }
        }

        reviews.push({
          id: review.id,
          rating: review.rating,
          reviewer: reviewerName,
          reviewerUrl: reviewerUrl,
          date: review.createdAt
            ? new Date(review.createdAt).toLocaleDateString()
            : "",
          content: review.text?.replace(/<[^>]*>/g, "") || "",
        });
      }
    }

    // Get pagination info
    const rootQuery = apolloState.ROOT_QUERY;
    const getReviewsKey = Object.keys(rootQuery).find((k) =>
      k.startsWith("getReviews")
    );
    const reviewsData = getReviewsKey ? rootQuery[getReviewsKey] : null;

    return {
      workId,
      bookInfo,
      initialReviews: reviews,
      nextPageToken: reviewsData?.pageInfo?.nextPageToken || null,
      totalCount: reviewsData?.totalCount || 0,
      apiKey,
    };
  } catch {
    return null;
  }
}

async function fetchReviewsViaGraphQL(
  workId: string,
  pageToken: string | null,
  apiKey: string
): Promise<{
  reviews: Review[];
  nextPageToken: string | null;
  totalCount: number;
} | null> {
  const variables: {
    filters: { resourceType: string; resourceId: string };
    pagination: { limit: number; after?: string };
  } = {
    filters: {
      resourceType: "WORK",
      resourceId: workId,
    },
    pagination: {
      limit: 30,
    },
  };

  if (pageToken) {
    variables.pagination.after = pageToken;
  }

  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        Origin: "https://www.goodreads.com",
        Referer: "https://www.goodreads.com/",
      },
      body: JSON.stringify({
        operationName: "getReviews",
        variables,
        query: REVIEWS_QUERY,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const reviewsConnection = data?.data?.getReviews;
    if (!reviewsConnection) return null;

    const reviews: Review[] = [];
    for (const edge of reviewsConnection.edges || []) {
      const node = edge.node as GraphQLReview;
      if (node && node.rating >= 4) {
        reviews.push({
          id: node.id,
          rating: node.rating,
          reviewer: node.creator?.name || "Anonymous",
          reviewerUrl: node.creator?.webUrl || "",
          date: node.createdAt
            ? new Date(node.createdAt).toLocaleDateString()
            : "",
          content: node.text?.replace(/<[^>]*>/g, "") || "",
        });
      }
    }

    return {
      reviews,
      nextPageToken: reviewsConnection.pageInfo?.nextPageToken || null,
      totalCount: reviewsConnection.totalCount || 0,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get("url");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageToken = searchParams.get("pageToken");
  const workId = searchParams.get("workId");
  const apiKey = searchParams.get("apiKey");

  if (!url) {
    return NextResponse.json(
      { error: "Missing 'url' query parameter" },
      { status: 400 }
    );
  }

  if (!url.includes("goodreads.com")) {
    return NextResponse.json(
      { error: "URL must be a Goodreads URL" },
      { status: 400 }
    );
  }

  try {
    // Page 1: Fetch from HTML to get workId and initial data
    if (page === 1 || !workId) {
      const pageData = await fetchBookPageData(url);

      if (!pageData) {
        return NextResponse.json(
          { error: "Failed to fetch book data" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        book: pageData.bookInfo,
        reviews: pageData.initialReviews,
        totalFiltered: pageData.initialReviews.length,
        totalCount: pageData.totalCount,
        pagination: {
          currentPage: 1,
          hasNext: !!pageData.nextPageToken,
          hasPrev: false,
          nextPageToken: pageData.nextPageToken,
          workId: pageData.workId,
          apiKey: pageData.apiKey,
        },
      });
    }

    // Subsequent pages: Use GraphQL API
    const graphqlResult = await fetchReviewsViaGraphQL(
      workId,
      pageToken || null,
      apiKey || FALLBACK_API_KEY
    );

    if (!graphqlResult) {
      return NextResponse.json(
        { error: "Failed to fetch reviews" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      book: null, // Book info not refetched on pagination
      reviews: graphqlResult.reviews,
      totalFiltered: graphqlResult.reviews.length,
      totalCount: graphqlResult.totalCount,
      pagination: {
        currentPage: page,
        hasNext: !!graphqlResult.nextPageToken,
        hasPrev: page > 1,
        nextPageToken: graphqlResult.nextPageToken,
        workId,
      },
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return NextResponse.json(
      { error: "Failed to fetch and parse reviews" },
      { status: 500 }
    );
  }
}
