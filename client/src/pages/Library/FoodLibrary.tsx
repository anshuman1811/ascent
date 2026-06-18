import { useState, useEffect, type ChangeEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../components/ui/Toast';
import { Search, Plus, Edit2, Trash2, Image, ChevronDown, ChevronUp, X } from 'lucide-react';
import { api } from '../../api/client';
import type { Food, FoodIngredient } from '../../types';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import ImageGallery from '../../components/ui/ImageGallery';

const UNIT_OPTIONS = [
  { value: 'g',       label: 'g (grams)' },
  { value: 'ml',      label: 'ml (millilitres)' },
  { value: 'oz',      label: 'oz (ounces)' },
  { value: 'cup',     label: 'cup' },
  { value: 'tbsp',    label: 'tbsp (tablespoon)' },
  { value: 'tsp',     label: 'tsp (teaspoon)' },
  { value: 'serving', label: 'serving' },
  { value: 'piece',   label: 'piece' },
  { value: 'slice',   label: 'slice' },
];

export default function FoodLibrary() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [editFood, setEditFood] = useState<Food | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data: foods = [], isLoading } = useQuery({
    queryKey: ['foods', search],
    queryFn: () => api.get<Food[]>(`/foods?search=${encodeURIComponent(search)}`),
  });

  const deleteFood = useMutation({
    mutationFn: (id: number) => api.delete(`/foods/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['foods'] }),
    onError: (err: Error) => toast(err.message, 'error'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Food Library</h1>
          <p className="text-xs text-gray-500 mt-0.5">{foods.length} item{foods.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setShowAdd(true)} size="sm">
          <Plus size={14} /> Add Food
        </Button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          placeholder="Search foods…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <div className="text-center py-8 text-gray-600 text-sm">Loading…</div>}

      {!isLoading && foods.length === 0 && (
        <div className="text-center py-12 text-gray-600">
          <p className="text-sm">{search ? `No results for "${search}"` : 'No foods yet.'}</p>
          <p className="text-xs mt-1">Add your first food to get started.</p>
        </div>
      )}

      <div className="space-y-2">
        {foods.map(food => (
          <FoodCard
            key={food.id}
            food={food}
            onEdit={() => setEditFood(food)}
            onDelete={() => deleteFood.mutate(food.id)}
          />
        ))}
      </div>

      <FoodFormModal
        open={showAdd || !!editFood}
        food={editFood}
        onClose={() => { setShowAdd(false); setEditFood(null); }}
        onSaved={() => { qc.invalidateQueries({ queryKey: ['foods'] }); setShowAdd(false); setEditFood(null); }}
      />
    </div>
  );
}

function FoodCard({ food, onEdit, onDelete }: { food: Food; onEdit: () => void; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: images = [] } = useQuery<{ url: string; id: number }[]>({
    queryKey: ['images', 'food', food.id],
    queryFn: () => api.get(`/images/food/${food.id}`),
  });
  const thumb = images[0];

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-3.5 flex items-center gap-3">
      {thumb ? (
        <img src={thumb.url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
          <Image size={18} className="text-gray-600" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white truncate">{food.name}</p>
          {food.brand && <span className="text-xs text-gray-500 shrink-0">{food.brand}</span>}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          <span className="whitespace-nowrap">Per {food.serving_size} {food.serving_unit}:</span>
          {' '}<span className="text-white whitespace-nowrap">{food.calories} kcal</span>
          {' · '}<span className="text-blue-400 whitespace-nowrap">{food.protein_g}g P</span>
          {' · '}<span className="text-yellow-400 whitespace-nowrap">{food.carbs_g}g C</span>
          {' · '}<span className="text-orange-400 whitespace-nowrap">{food.fat_g}g Fat</span>
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {confirmDelete ? (
          <>
            <button onClick={() => { onDelete(); setConfirmDelete(false); }}
              className="text-xs px-2 py-1 rounded-lg bg-red-900/50 text-red-400 hover:bg-red-900 transition-colors">
              Del
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="text-xs px-2 py-1 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors">
              No
            </button>
          </>
        ) : (
          <>
            <button onClick={onEdit} className="p-2 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors">
              <Edit2 size={14} />
            </button>
            <button onClick={() => setConfirmDelete(true)} className="p-2 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-red-400 transition-colors">
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Ingredient picker (used inside FoodFormModal) ────────────────────────────

function computeMacros(ingredients: FoodIngredient[]) {
  let calories = 0, protein_g = 0, carbs_g = 0, fat_g = 0, fiber_g = 0, sugar_g = 0;
  for (const ing of ingredients) {
    const scale = ing.quantity / ing.serving_size;
    calories  += ing.calories  * scale;
    protein_g += ing.protein_g * scale;
    carbs_g   += ing.carbs_g   * scale;
    fat_g     += ing.fat_g     * scale;
    fiber_g   += ing.fiber_g   * scale;
    sugar_g   += ing.sugar_g   * scale;
  }
  return {
    calories:  Math.round(calories),
    protein_g: Math.round(protein_g * 10) / 10,
    carbs_g:   Math.round(carbs_g   * 10) / 10,
    fat_g:     Math.round(fat_g     * 10) / 10,
    fiber_g:   Math.round(fiber_g   * 10) / 10,
    sugar_g:   Math.round(sugar_g   * 10) / 10,
  };
}

interface PendingIngredient {
  food: Food;
  quantity: number;
}

function IngredientPicker({
  foodId,
  pendingIngredients,
  onPendingChange,
}: {
  foodId: number | null; // null = food not saved yet
  pendingIngredients: PendingIngredient[];
  onPendingChange: (list: PendingIngredient[]) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [editQty, setEditQty] = useState<{ id: number; qty: string } | null>(null);

  const { data: searchResults = [] } = useQuery({
    queryKey: ['foods', search],
    queryFn: () => api.get<Food[]>(`/foods?search=${encodeURIComponent(search)}&limit=15`),
    enabled: search.length >= 1,
  });

  // Persisted ingredients (food already exists in DB)
  const { data: savedIngredients = [], refetch: refetchIngredients } = useQuery({
    queryKey: ['food-ingredients', foodId],
    queryFn: () => api.get<FoodIngredient[]>(`/foods/${foodId}/ingredients`),
    enabled: foodId !== null,
  });

  const addIngredient = useMutation({
    mutationFn: ({ ingredientFoodId, quantity }: { ingredientFoodId: number; quantity: number }) =>
      api.post(`/foods/${foodId}/ingredients`, { ingredient_food_id: ingredientFoodId, quantity }),
    onSuccess: () => { refetchIngredients(); qc.invalidateQueries({ queryKey: ['food-ingredients', foodId] }); setSearch(''); },
  });

  const updateIngredient = useMutation({
    mutationFn: ({ id, quantity }: { id: number; quantity: number }) =>
      api.put(`/foods/ingredients/${id}`, { quantity }),
    onSuccess: () => refetchIngredients(),
  });

  const removeIngredient = useMutation({
    mutationFn: (id: number) => api.delete(`/foods/ingredients/${id}`),
    onSuccess: () => refetchIngredients(),
  });

  const allIngredients: Array<{ key: string; name: string; brand?: string; serving_size: number; serving_unit: string; qty: number; persisted?: FoodIngredient; pending?: PendingIngredient & { idx: number } }> = [
    ...savedIngredients.map(si => ({
      key: `saved-${si.id}`,
      name: si.name,
      brand: si.brand,
      serving_size: si.serving_size,
      serving_unit: si.serving_unit,
      qty: si.quantity,
      persisted: si,
    })),
    ...pendingIngredients.map((pi, idx) => ({
      key: `pending-${idx}`,
      name: pi.food.name,
      brand: pi.food.brand,
      serving_size: pi.food.serving_size,
      serving_unit: pi.food.serving_unit,
      qty: pi.quantity,
      pending: { ...pi, idx },
    })),
  ];

  function handleAdd(food: Food) {
    setSearch('');
    if (foodId !== null) {
      addIngredient.mutate({ ingredientFoodId: food.id, quantity: food.serving_size });
    } else {
      onPendingChange([...pendingIngredients, { food, quantity: food.serving_size }]);
    }
  }

  function handleUpdateQty(item: typeof allIngredients[0], qty: number) {
    if (item.persisted) {
      updateIngredient.mutate({ id: item.persisted.id, quantity: qty });
    } else if (item.pending) {
      const next = [...pendingIngredients];
      next[item.pending.idx] = { ...next[item.pending.idx], quantity: qty };
      onPendingChange(next);
    }
  }

  function handleRemove(item: typeof allIngredients[0]) {
    if (item.persisted) {
      removeIngredient.mutate(item.persisted.id);
    } else if (item.pending) {
      const next = pendingIngredients.filter((_, i) => i !== item.pending!.idx);
      onPendingChange(next);
    }
  }

  const computed = computeMacros(
    allIngredients.map(i => ({
      id: 0, food_id: 0, ingredient_food_id: 0,
      quantity: i.qty,
      name: i.name,
      serving_size: i.serving_size,
      serving_unit: i.serving_unit,
      calories: i.persisted?.calories ?? (i.pending?.food.calories ?? 0),
      protein_g: i.persisted?.protein_g ?? (i.pending?.food.protein_g ?? 0),
      carbs_g: i.persisted?.carbs_g ?? (i.pending?.food.carbs_g ?? 0),
      fat_g: i.persisted?.fat_g ?? (i.pending?.food.fat_g ?? 0),
      fiber_g: i.persisted?.fiber_g ?? (i.pending?.food.fiber_g ?? 0),
      sugar_g: i.persisted?.sugar_g ?? (i.pending?.food.sugar_g ?? 0),
    }))
  );

  return (
    <div className="space-y-3">
      {/* Ingredient search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          placeholder="Search ingredients (try 'Olive Oil', 'Rice', 'Chicken'…)"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {search && searchResults.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden max-h-40 overflow-y-auto">
          {searchResults.map(f => (
            <button
              key={f.id}
              onClick={() => handleAdd(f)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-700 text-left text-sm"
            >
              <span className="text-white">{f.name} {f.brand && <span className="text-gray-500 text-xs">· {f.brand}</span>}</span>
              <span className="text-gray-500 text-xs ml-2">per {f.serving_size} {f.serving_unit}</span>
            </button>
          ))}
        </div>
      )}
      {search && searchResults.length === 0 && (
        <p className="text-xs text-gray-500 px-1">No matches. Add the ingredient to Food Library first.</p>
      )}

      {/* Current ingredient list */}
      {allIngredients.length > 0 && (
        <div className="space-y-1.5">
          {allIngredients.map(item => (
            <div key={item.key} className="flex items-center gap-2 bg-gray-800/60 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white truncate">{item.name}</p>
                <p className="text-[10px] text-gray-500">{item.serving_size} {item.serving_unit} = {item.persisted?.calories ?? item.pending?.food.calories ?? 0} kcal</p>
              </div>
              {editQty?.id === allIngredients.indexOf(item) ? (
                <input
                  type="number"
                  value={editQty.qty}
                  onChange={e => setEditQty({ id: editQty.id, qty: e.target.value })}
                  onBlur={() => {
                    handleUpdateQty(item, parseFloat(editQty.qty) || item.qty);
                    setEditQty(null);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleUpdateQty(item, parseFloat(editQty.qty) || item.qty);
                      setEditQty(null);
                    }
                  }}
                  autoFocus
                  className="w-16 bg-gray-700 border border-indigo-500 rounded px-2 py-1 text-xs text-white focus:outline-none"
                />
              ) : (
                <button
                  onClick={() => setEditQty({ id: allIngredients.indexOf(item), qty: String(item.qty) })}
                  className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded hover:bg-gray-700"
                >
                  {item.qty} {item.serving_unit}
                </button>
              )}
              <button onClick={() => handleRemove(item)} className="text-gray-600 hover:text-red-400 p-1">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Computed totals */}
      {allIngredients.length > 0 && (
        <div className="bg-indigo-900/20 border border-indigo-800/40 rounded-lg p-3">
          <p className="text-[10px] text-indigo-400 font-medium mb-1.5">Computed totals from ingredients</p>
          <div className="flex gap-3 text-sm flex-wrap">
            <span className="text-white font-semibold">{computed.calories} kcal</span>
            <span className="text-blue-400">{computed.protein_g}g P</span>
            <span className="text-yellow-400">{computed.carbs_g}g C</span>
            <span className="text-orange-400">{computed.fat_g}g Fat</span>
            {computed.fiber_g > 0 && <span className="text-green-400">{computed.fiber_g}g Fib</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main food form modal ─────────────────────────────────────────────────────

function FoodFormModal({ open, food, onClose, onSaved }: {
  open: boolean; food: Food | null; onClose: () => void; onSaved: () => void;
}) {
  const blank: Partial<Food> = {
    name: '', brand: '', serving_size: 100, serving_unit: 'g',
    calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
    saturated_fat_g: 0, fiber_g: 0, sugar_g: 0,
    cholesterol_mg: 0, sodium_mg: 0, potassium_mg: 0,
  };
  const [form, setForm] = useState<Partial<Food>>(food ?? blank);
  const [macroMode, setMacroMode] = useState<'manual' | 'ingredients'>('manual');
  const [pendingIngredients, setPendingIngredients] = useState<PendingIngredient[]>([]);
  // After a new food is saved we keep the modal open for photos / ingredients
  const [savedFood, setSavedFood] = useState<Food | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!open) {
      setSavedFood(null);
      setMacroMode('manual');
      setPendingIngredients([]);
      setShowAdvanced(false);
    }
  }, [open]);

  if (food && food.id !== (form as any)._synced) {
    setForm({ ...blank, ...food, _synced: food.id } as any);
  }
  if (!food && !savedFood && !(form as any)._synced && open && (form as any)._synced !== 0) {
    // reset for new food if form still has old synced data
  }

  const activeFood = food ?? savedFood;

  const computedFromIngredients = computeMacros(pendingIngredients.map(pi => ({
    id: 0, food_id: 0, ingredient_food_id: 0,
    quantity: pi.quantity,
    name: pi.food.name,
    serving_size: pi.food.serving_size,
    serving_unit: pi.food.serving_unit,
    calories: pi.food.calories,
    protein_g: pi.food.protein_g,
    carbs_g: pi.food.carbs_g,
    fat_g: pi.food.fat_g,
    fiber_g: pi.food.fiber_g,
    sugar_g: pi.food.sugar_g,
  })));

  const save = useMutation({
    mutationFn: async () => {
      let macros = {
        calories: form.calories ?? 0,
        protein_g: form.protein_g ?? 0,
        carbs_g: form.carbs_g ?? 0,
        fat_g: form.fat_g ?? 0,
        fiber_g: form.fiber_g ?? 0,
        sugar_g: form.sugar_g ?? 0,
      };
      if (macroMode === 'ingredients' && pendingIngredients.length > 0 && !activeFood) {
        macros = computedFromIngredients;
      }

      const payload = { ...form, ...macros };
      let result: Food;
      if (activeFood) {
        result = await api.put<Food>(`/foods/${activeFood.id}`, payload);
      } else {
        result = await api.post<Food>('/foods', payload);
      }

      // If there are pending ingredients, persist them now that the food exists
      if (!activeFood && pendingIngredients.length > 0) {
        for (const pi of pendingIngredients) {
          await api.post(`/foods/${result.id}/ingredients`, {
            ingredient_food_id: pi.food.id,
            quantity: pi.quantity,
          });
        }
        setPendingIngredients([]);
      }

      return result;
    },
    onSuccess: (result) => {
      if (!activeFood) {
        // New food: keep modal open so user can add photos / more ingredients
        setSavedFood(result);
        setForm(f => ({ ...f, _synced: result.id } as any));
      } else {
        onSaved();
      }
    },
  });

  const num = (k: keyof Food) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: parseFloat(e.target.value) || 0 }));
  const str = (k: keyof Food) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const modalTitle = activeFood
    ? (food ? 'Edit Food' : `"${savedFood!.name}" saved!`)
    : 'Add Food';

  const unitValue = UNIT_OPTIONS.some(o => o.value === (form.serving_unit ?? 'g'))
    ? (form.serving_unit ?? 'g')
    : 'g';

  return (
    <Modal open={open} onClose={savedFood ? onSaved : onClose} title={modalTitle} size="md">
      <div className="space-y-3">
        {savedFood && (
          <div className="bg-green-900/20 border border-green-800/40 rounded-xl px-3 py-2">
            <p className="text-xs text-green-400">Food saved. Add photos or ingredients below, then tap Done.</p>
          </div>
        )}

        {!savedFood && (
          <>
            <Input label="Food name *" value={form.name ?? ''} onChange={str('name')} placeholder="e.g. Chicken Breast"
              onKeyDown={e => { if (e.key === 'Enter' && form.name && !save.isPending) save.mutate(); }} />
            <Input label="Brand (optional)" value={form.brand ?? ''} onChange={str('brand')} placeholder="e.g. Generic" />

            <div className="bg-gray-800/50 rounded-xl p-3 space-y-3">
              <p className="text-xs font-medium text-gray-400">Serving size</p>
              <div className="grid grid-cols-2 gap-2">
                <Input label="Amount" type="number" value={form.serving_size ?? 100} onChange={num('serving_size')} />
                <Select
                  label="Unit"
                  value={unitValue}
                  onChange={str('serving_unit')}
                  options={UNIT_OPTIONS}
                />
              </div>
            </div>

            {/* Macro mode toggle */}
            <div className="flex gap-1 bg-gray-800 rounded-xl p-1">
              <button
                onClick={() => setMacroMode('manual')}
                className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${macroMode === 'manual' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Enter macros manually
              </button>
              <button
                onClick={() => setMacroMode('ingredients')}
                className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${macroMode === 'ingredients' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Build from ingredients
              </button>
            </div>
          </>
        )}

        {macroMode === 'manual' && !savedFood && (
          <>
            <div className="bg-gray-800/50 rounded-xl p-3 space-y-3">
              <p className="text-xs font-medium text-gray-400">Macros per serving above</p>
              <div className="grid grid-cols-3 gap-2">
                <Input label="Calories" type="number" value={form.calories ?? 0} onChange={num('calories')} />
                <Input label="Protein (g)" type="number" value={form.protein_g ?? 0} onChange={num('protein_g')} />
                <Input label="Carbs (g)" type="number" value={form.carbs_g ?? 0} onChange={num('carbs_g')} />
                <Input label="Fat (g)" type="number" value={form.fat_g ?? 0} onChange={num('fat_g')} />
                <Input label="Fiber (g)" type="number" value={form.fiber_g ?? 0} onChange={num('fiber_g')} />
                <Input label="Sugar (g)" type="number" value={form.sugar_g ?? 0} onChange={num('sugar_g')} />
              </div>
            </div>

            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
            >
              {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Full nutrition label (optional)
            </button>

            {showAdvanced && (
              <div className="bg-gray-800/50 rounded-xl p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Saturated Fat (g)" type="number" step="0.1" value={form.saturated_fat_g ?? 0} onChange={num('saturated_fat_g')} />
                  <Input label="Cholesterol (mg)" type="number" value={form.cholesterol_mg ?? 0} onChange={num('cholesterol_mg')} />
                  <Input label="Sodium (mg)" type="number" value={form.sodium_mg ?? 0} onChange={num('sodium_mg')} />
                  <Input label="Potassium (mg)" type="number" value={form.potassium_mg ?? 0} onChange={num('potassium_mg')} />
                </div>
                {/* Added sugar — separate nullable field; leave blank if unknown */}
                <div>
                  <p className="text-[10px] text-gray-500 mb-1.5">
                    Added Sugar (g) <span className="text-gray-600">— leave blank if unknown (will show as N/A, not zero)</span>
                  </p>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.added_sugar_g ?? ''}
                    onChange={e => setForm(f => ({ ...f, added_sugar_g: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0 }))}
                    placeholder="e.g. 5"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}
          </>
        )}

        {macroMode === 'ingredients' && !savedFood && (
          <div className="bg-gray-800/50 rounded-xl p-3 space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-400 mb-1">Ingredients</p>
              <p className="text-[10px] text-gray-600">Macros will be auto-calculated. Common pantry items are pre-loaded.</p>
            </div>
            <IngredientPicker
              foodId={null}
              pendingIngredients={pendingIngredients}
              onPendingChange={setPendingIngredients}
            />
          </div>
        )}

        {/* Photos + ingredients for existing/just-saved food */}
        {activeFood && (
          <>
            <div className="bg-gray-800/50 rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-gray-400">Photos</p>
              <ImageGallery entityType="food" entityId={activeFood.id} />
            </div>

            <div className="bg-gray-800/50 rounded-xl p-3 space-y-3">
              <p className="text-xs font-medium text-gray-400">Ingredients <span className="text-gray-600 font-normal">(optional — for auto-computed macros)</span></p>
              <IngredientPicker
                foodId={activeFood.id}
                pendingIngredients={[]}
                onPendingChange={() => {}}
              />
            </div>
          </>
        )}

        <div className="flex gap-2 pt-1">
          {savedFood ? (
            <Button onClick={onSaved} className="w-full">Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
              <Button
                onClick={() => save.mutate()}
                disabled={!form.name || save.isPending}
                className="flex-1"
              >
                {save.isPending ? 'Saving…' : activeFood ? 'Save Changes' : 'Add Food'}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
