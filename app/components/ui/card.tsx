export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg rounded-3xl shadow-2xl ${className}`}>
      {children}
    </div>
  );
} 