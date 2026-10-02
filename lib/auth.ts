import NextAuth, { type NextAuthOptions, getServerSession } from "next-auth";
import Google from "next-auth/providers/google";

// Only this account may sign in. Set ADMIN_EMAIL in .env.local and in Vercel.
export function isAdminEmail(email: string | null | undefined): boolean {
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return Boolean(admin && email && email.trim().toLowerCase() === admin);
}

export const authOptions: NextAuthOptions = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/auth/signin",
    error: "/auth/signin",
  },
  callbacks: {
    // Reject every Google account except the admin's (verified email only)
    async signIn({ profile }) {
      const googleProfile = profile as { email?: string; email_verified?: boolean } | undefined;
      return Boolean(googleProfile?.email_verified && isAdminEmail(googleProfile.email));
    },
    // Re-check on every request so sessions issued before this lockdown stop working
    async jwt({ token }) {
      token.isAdmin = isAdminEmail(token.email);
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.isAdmin = Boolean(token.isAdmin);
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

export async function auth() {
  return getServerSession(authOptions);
}

// Returns the session when the caller is the admin, otherwise null
export async function getAdminSession() {
  const session = await auth();
  return session?.user?.isAdmin ? session : null;
}
