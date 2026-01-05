interface HowItWorksStepProps {
  stepNumber: number;
  imageSrc: string;
  imageAlt: string;
  title: string;
  description: string;
  badgeColor: string;
  borderColor: string;
}

export default function HowItWorksStep({
  stepNumber,
  imageSrc,
  imageAlt,
  title,
  description,
  badgeColor,
  borderColor,
}: HowItWorksStepProps) {
  return (
    <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
      <div className="relative flex-shrink-0 w-full md:w-48">
        <img
          src={imageSrc}
          alt={imageAlt}
          className="w-full h-auto rounded-lg border-2 shadow-lg"
          style={{ borderColor }}
        />
        <div
          className="absolute -top-3 -left-3 w-12 h-12 rounded-full text-white flex items-center justify-center font-bold text-lg shadow-md z-10"
          style={{ backgroundColor: badgeColor }}
        >
          {stepNumber}
        </div>
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-lg mb-2 text-foreground">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

