interface RatingPickerProps {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

export default function RatingPicker({ value, onChange, disabled }: RatingPickerProps) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2, 3].map((rating) => (
        <button
          key={rating}
          disabled={disabled}
          onClick={() => onChange(rating)}
          className={`h-7 w-7 rounded border text-xs font-semibold transition-colors ${
            value === rating
              ? 'border-indigo-600 bg-indigo-600 text-white'
              : 'border-gray-300 bg-white text-gray-600 hover:border-indigo-400 hover:text-indigo-600'
          } disabled:cursor-not-allowed disabled:opacity-60`}
          title={`Contribution ${rating}`}
          type="button"
        >
          {rating}
        </button>
      ))}
    </div>
  );
}
