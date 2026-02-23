interface TableProps {
  columns: { key: string; label: string; className?: string }[];
  data: Record<string, any>[];
  emptyMessage?: string;
}

const Table = ({ columns, data, emptyMessage = 'Kayıt bulunamadı' }: TableProps) => {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-4 py-3 text-left text-sm font-semibold text-neutral-700 ${column.className || ''}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={index} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
              {columns.map((column) => (
                <td
                  key={`${index}-${column.key}`}
                  className={`px-4 py-3 text-sm text-neutral-600 ${column.className || ''}`}
                >
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Table;
