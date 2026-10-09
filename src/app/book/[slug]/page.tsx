import { notFound } from "next/navigation";
import { PublicBookingService } from "@/services/public-booking.service";
import { BookingFlow } from "./booking-flow";

export interface PublicBookingPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function PublicBookingPage({ params }: PublicBookingPageProps) {
  const { slug } = await params;

  const business = await PublicBookingService.getPublicBusiness(slug);
  if (!business) {
    notFound();
  }

  const services = await PublicBookingService.getPublicServices(slug);

  return <BookingFlow business={business} services={services} />;
}
