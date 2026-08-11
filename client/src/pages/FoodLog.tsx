import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { Plus, Trash2, ChevronDown, ChevronUp, Clock, ChevronLeft, ChevronRight, Pencil, Check, X, Zap, Sparkles } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import { parseSQLiteLocal, convertToServingUnit, MASS_VOL_UNITS } from '../utils/units';
import { RESTAURANT_FILTERS } from '../utils/restaurantFilters';
import type { Meal, MealType, Food, MealItem } from '../types';
import { MacroPills, MacroBar, MacroBreakdown } from '../components/ui/MacroDisplay';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import ImageGallery from '../components/ui/ImageGallery';
import type { ChangeEvent } from 'react';

interface OutletCtx { userId: number; }

interface AiParsedItem {
  name: string;
  serving_size: number;
  serving_unit: string;
  quantity: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  saturated_fat_g?: number;
  sodium_mg?: number;
  cholesterol_mg?: number;
  potassium_mg?: number;
  added_sugar_g?: number;
  // runtime UI state
  _qty: string;
  _include: boolean;
}

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast',    label: '🌅 Breakfast' },
  { value: 'lunch',        label: '☀️ Lunch' },
  { value: 'dinner',       label: '🌙 Dinner' },
  { value: 'snack',        label: '🍎 Snack' },
  { value: 'pre_workout',  label: '⚡ Pre-workout' },
  { value: 'post_workout', label: '💪 Post-workout' },
];

function getDefaultMealType(): MealType {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return 'breakfast';
  if (h >= 10 && h < 14) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function today() { return fmt(new Date()); }


export default function FoodLog({ userId: propUserId }: { userId?: number }) {
  const ctx = useOutletContext<OutletCtx | null>();
  const { activeUserId } = useAppStore();
  const userId = propUserId ?? ctx?.userId ?? activeUserId;
  const qc = useQueryClient();

  const [date, setDate] = useState(today);
  const isToday = date === today();
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);
  const [dragX, setDragX] = useState(0);
  const [swipeTransition, setSwipeTransition] = useState(false);
  const [addMealOpen, setAddMealOpen] = useState(false);
  const [addFoodOpen, setAddFoodOpen] = useState<number | null>(null); // mealId
  const [expandedMeals, setExpandedMeals] = useState<Set<number>>(new Set());
  const [freshMealId, setFreshMealId] = useState<number | null>(null);

  const { data: meals = [] } = useQuery({
    queryKey: ['meals', userId, date],
    queryFn: () => api.get<Meal[]>(`/meals/user/${userId}?date=${date}`),
    enabled: !!userId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['meals', userId, date] });
    qc.invalidateQueries({ queryKey: ['daily-summary', userId, date] });
  };

  const createMeal = useMutation({
    mutationFn: (data: { meal_type: MealType; user_id: number }) =>
      api.post<Meal>('/meals', {
        ...data,
        // preserve the browsed date; use noon local time so the date survives UTC conversion
        logged_at: date !== today() ? new Date(`${date}T12:00:00`).toISOString() : undefined,
      }),
    onSuccess: (meal) => {
      invalidate();
      setAddMealOpen(false);
      setAddFoodOpen(meal.id);
      setFreshMealId(meal.id);
      setExpandedMeals(prev => new Set([...prev, meal.id]));
    },
  });

  const deleteMeal = useMutation({
    mutationFn: (id: number) => api.delete(`/meals/${id}`),
    onSuccess: invalidate,
  });

  const deleteItem = useMutation({
    mutationFn: (id: number) => api.delete(`/meals/items/${id}`),
    onSuccess: invalidate,
  });

  const editItem = useMutation({
    mutationFn: ({ itemId, ...data }: { itemId: number; quantity?: number; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; fiber_g?: number; sugar_g?: number }) =>
      api.put(`/meals/items/${itemId}`, data),
    onSuccess: invalidate,
  });

  const totals = meals.reduce(
    (acc, m) => ({
      calories:  acc.calories  + m.totals.calories,
      protein_g: acc.protein_g + m.totals.protein_g,
      carbs_g:   acc.carbs_g   + m.totals.carbs_g,
      fat_g:     acc.fat_g     + m.totals.fat_g,
      fiber_g:   acc.fiber_g   + m.totals.fiber_g,
      sugar_g:       acc.sugar_g       + m.totals.sugar_g,
      added_sugar_g: acc.added_sugar_g + (m.totals.added_sugar_g || 0),
      saturated_fat_g: acc.saturated_fat_g + m.totals.saturated_fat_g,
      cholesterol_mg:  acc.cholesterol_mg  + m.totals.cholesterol_mg,
      sodium_mg:       acc.sodium_mg       + m.totals.sodium_mg,
      potassium_mg:    acc.potassium_mg    + m.totals.potassium_mg,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0,
      added_sugar_g: 0, saturated_fat_g: 0, cholesterol_mg: 0, sodium_mg: 0, potassium_mg: 0 }
  );

  function shiftDate(delta: number) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setDate(fmt(d));
  }

  const toggleMeal = (id: number) => setExpandedMeals(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div
      className="space-y-4"
      style={{ transform: `translateX(${dragX}px)`, transition: swipeTransition ? 'transform 0.2s ease-out' : 'none' }}
      onTouchStart={e => {
        swipeStartX.current = e.touches[0].clientX;
        swipeStartY.current = e.touches[0].clientY;
        setSwipeTransition(false);
      }}
      onTouchMove={e => {
        const dx = e.touches[0].clientX - swipeStartX.current;
        const dy = e.touches[0].clientY - swipeStartY.current;
        if (Math.abs(dy) > Math.abs(dx)) return;
        setDragX(dx < 0 && isToday ? Math.max(dx * 0.15, -25) : dx);
      }}
      onTouchEnd={e => {
        const dx = e.changedTouches[0].clientX - swipeStartX.current;
        const isForward = dx < 0;
        if (Math.abs(dx) > 60 && !(isForward && isToday)) {
          setSwipeTransition(true);
          setDragX(isForward ? -window.innerWidth : window.innerWidth);
          setTimeout(() => {
            shiftDate(isForward ? 1 : -1);
            setSwipeTransition(false);
            setDragX(isForward ? window.innerWidth : -window.innerWidth);
            requestAnimationFrame(() => requestAnimationFrame(() => {
              setSwipeTransition(true);
              setDragX(0);
            }));
          }, 120);
        } else {
          setSwipeTransition(true);
          setDragX(0);
        }
      }}
    >
      {/* Date navigator */}
      <div className="flex items-center justify-between">
        <button onClick={() => shiftDate(-1)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <h1 className="text-base font-bold text-white">
            {isToday ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </h1>
          {!isToday && (
            <button onClick={() => setDate(today())} className="text-xs text-indigo-400 hover:text-indigo-300">
              Back to today
            </button>
          )}
        </div>
        <button
          onClick={() => shiftDate(1)}
          disabled={isToday}
          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Daily totals summary */}
      {meals.length > 0 && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Day Total</span>
            <span className="text-lg font-bold text-white">{Math.round(totals.calories)} kcal</span>
          </div>
          <MacroBar macros={totals} />
          <div className="flex gap-4 mt-2">
            <span className="text-xs text-sky-400">{Math.round(totals.protein_g)}g P</span>
            <span className="text-xs text-amber-400">{Math.round(totals.carbs_g)}g C</span>
            <span className="text-xs text-orange-400">{Math.round(totals.fat_g)}g Fat</span>
            <span className="text-xs text-emerald-400">{Math.round(totals.fiber_g)}g Fib</span>
          </div>
        </div>
      )}

      {meals.length === 0 && (
        <div className="text-center py-12 text-gray-600">
          <p className="text-sm">No meals logged{isToday ? ' yet' : ' for this day'}.</p>
          <p className="text-xs mt-1">Tap + to add your first meal.</p>
        </div>
      )}

      {meals.map(meal => (
        <MealCard
          key={meal.id}
          meal={meal}
          expanded={expandedMeals.has(meal.id)}
          onToggle={() => toggleMeal(meal.id)}
          onAddFood={() => setAddFoodOpen(meal.id)}
          onDelete={() => deleteMeal.mutate(meal.id)}
          onDeleteItem={(itemId) => deleteItem.mutate(itemId)}
          onEditItem={(itemId, data) => editItem.mutate({ itemId, ...data })}
        />
      ))}

      <Button onClick={() => setAddMealOpen(true)} className="w-full" variant="secondary">
        <Plus size={16} /> Add Meal
      </Button>

      <AddMealModal
        open={addMealOpen}
        onClose={() => setAddMealOpen(false)}
        onCreate={(type) => createMeal.mutate({ meal_type: type, user_id: userId })}
        loading={createMeal.isPending}
      />

      {addFoodOpen !== null && (
        <AddFoodModal
          open
          mealId={addFoodOpen}
          userId={userId}
          onClose={() => {
            if (freshMealId === addFoodOpen) {
              api.delete(`/meals/${freshMealId}`).then(invalidate);
            }
            setFreshMealId(null);
            setAddFoodOpen(null);
          }}
          onAdded={() => {
            setFreshMealId(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

// ─── MealCard ─────────────────────────────────────────────────────────────────

type MealItemEdit = { quantity?: number; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; fiber_g?: number; sugar_g?: number };

function MealCard({ meal, expanded, onToggle, onAddFood, onDelete, onDeleteItem, onEditItem }: {
  meal: Meal; expanded: boolean;
  onToggle: () => void; onAddFood: () => void; onDelete: () => void;
  onDeleteItem: (id: number) => void;
  onEditItem: (id: number, data: MealItemEdit) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mealLabel = MEAL_TYPES.find(t => t.value === meal.meal_type)?.label ?? meal.meal_type;
  const time = parseSQLiteLocal(meal.logged_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 text-left">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{mealLabel}</span>
              <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={11} />{time}</span>
            </div>
            <MacroPills macros={meal.totals} compact />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{Math.round(meal.totals.calories)} kcal</span>
          {expanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-800">
          {meal.items.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-600 italic">No items yet.</p>
          )}
          {meal.items.map(item => (
            <FoodItemRow
              key={item.id}
              item={item}
              onDelete={() => onDeleteItem(item.id)}
              onEdit={(data) => onEditItem(item.id, data)}
            />
          ))}
          <div className="px-4 py-3 border-t border-gray-800/50">
            <MacroBreakdown macros={meal.totals} />
          </div>
          <div className="px-4 py-3 border-t border-gray-800/50">
            <p className="text-xs font-medium text-gray-500 mb-2">Photos</p>
            <ImageGallery entityType="meal" entityId={meal.id} compact />
          </div>
          <div className="flex gap-2 p-3 border-t border-gray-800/50 items-center">
            <Button size="sm" variant="secondary" onClick={onAddFood} className="flex-1">
              <Plus size={13} /> Add Food
            </Button>
            {confirmDelete ? (
              <div className="flex items-center gap-1.5 ml-auto shrink-0">
                <span className="text-xs text-gray-400">Remove?</span>
                <button onClick={() => { onDelete(); setConfirmDelete(false); }}
                  className="text-xs px-2 py-1 rounded-lg bg-red-900/50 text-red-400 hover:bg-red-900 transition-colors">
                  Yes
                </button>
                <button onClick={() => setConfirmDelete(false)}
                  className="text-xs px-2 py-1 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors">
                  No
                </button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} className="text-red-500 hover:text-red-400 shrink-0">
                <Trash2 size={13} />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Ingredient breakdown ─────────────────────────────────────────────────────

type FoodIngredient = {
  id: number; food_id: number; ingredient_food_id: number; quantity: number;
  name: string; brand?: string; serving_size: number; serving_unit: string;
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
  fiber_g: number; sugar_g: number;
};

type IngredMacros = { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; sugar_g: number };

function IngredientBreakdown({ foodId, onMacrosChanged }: {
  foodId: number;
  onMacrosChanged: (macros: IngredMacros) => void;
}) {
  const [ingredients, setIngredients] = useState<FoodIngredient[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<FoodIngredient[]>(`/foods/${foodId}/ingredients`).then(setIngredients);
  }, [foodId]);

  function startEdit(ingred: FoodIngredient) {
    setEditingId(ingred.id);
    setEditQty(String(ingred.quantity));
    setEditUnit(ingred.serving_unit);
  }

  function handleUnitChange(newUnit: string) {
    const q = parseFloat(editQty);
    if (!isNaN(q)) setEditQty(String(convertToServingUnit(q, editUnit, newUnit)));
    setEditUnit(newUnit);
  }

  async function saveIngredient(ingred: FoodIngredient) {
    const rawQty = parseFloat(editQty);
    if (isNaN(rawQty) || rawQty <= 0) return;
    const newQty = editUnit !== ingred.serving_unit
      ? convertToServingUnit(rawQty, editUnit, ingred.serving_unit)
      : rawQty;
    setSaving(true);
    try {
      await api.put(`/foods/ingredients/${ingred.id}`, { quantity: newQty });
      const updated = ingredients!.map(i => i.id === ingred.id ? { ...i, quantity: newQty } : i);
      setIngredients(updated);
      setEditingId(null);
      const totals = updated.reduce((acc, i) => {
        const s = i.quantity / i.serving_size;
        return { calories: acc.calories + i.calories * s, protein_g: acc.protein_g + i.protein_g * s,
          carbs_g: acc.carbs_g + i.carbs_g * s, fat_g: acc.fat_g + i.fat_g * s,
          fiber_g: acc.fiber_g + i.fiber_g * s, sugar_g: acc.sugar_g + i.sugar_g * s };
      }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 });
      const rounded: IngredMacros = {
        calories: Math.round(totals.calories), protein_g: Math.round(totals.protein_g),
        carbs_g: Math.round(totals.carbs_g), fat_g: Math.round(totals.fat_g),
        fiber_g: Math.round(totals.fiber_g), sugar_g: Math.round(totals.sugar_g),
      };
      await api.put(`/foods/${foodId}`, rounded);
      onMacrosChanged(rounded);
    } finally {
      setSaving(false);
    }
  }

  if (ingredients === null) return (
    <div className="px-4 py-2 text-xs text-gray-500 italic">Loading breakdown…</div>
  );
  if (ingredients.length === 0) return (
    <div className="px-4 py-2 text-xs text-gray-600 italic">No ingredient breakdown saved</div>
  );
  return (
    <div className="px-4 pb-3 space-y-1.5">
      <p className="text-[10px] text-gray-600 pt-1 uppercase tracking-wider">Ingredients</p>
      {ingredients.map(ingred => {
        const scale = ingred.quantity / ingred.serving_size;
        const isEditing = editingId === ingred.id;
        return (
          <div key={ingred.id} className="flex items-center gap-1.5 group/ingred">
            <span className="text-xs text-gray-400 flex-1 truncate">{ingred.name}</span>
            {isEditing ? (
              <>
                <input type="number" value={editQty} onChange={e => setEditQty(e.target.value)} autoFocus
                  className="w-14 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-white focus:border-indigo-500 outline-none" />
                {MASS_VOL_UNITS.includes(ingred.serving_unit) ? (
                  <select value={editUnit} onChange={e => handleUnitChange(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-300 focus:border-indigo-500 outline-none">
                    {MASS_VOL_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                ) : (
                  <span className="text-[10px] text-gray-500">{ingred.serving_unit}</span>
                )}
                <button onClick={() => saveIngredient(ingred)} disabled={saving}
                  className="p-0.5 text-indigo-400 hover:text-indigo-300 disabled:opacity-50"><Check size={11} /></button>
                <button onClick={() => setEditingId(null)}
                  className="p-0.5 text-gray-600 hover:text-gray-400"><X size={11} /></button>
              </>
            ) : (
              <>
                <span className="text-[10px] text-gray-500 shrink-0">
                  {ingred.quantity % 1 === 0 ? ingred.quantity : ingred.quantity.toFixed(1)}{ingred.serving_unit} · {Math.round(ingred.calories * scale)} kcal
                </span>
                <button onClick={() => startEdit(ingred)}
                  className="p-0.5 text-gray-700 hover:text-indigo-400 opacity-0 group-hover/ingred:opacity-100 transition-opacity">
                  <Pencil size={10} />
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── FoodItemRow — inline qty editing ─────────────────────────────────────────

function FoodItemRow({ item, onDelete, onEdit }: {
  item: MealItem;
  onDelete: () => void;
  onEdit: (data: MealItemEdit) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editUnit, setEditUnit] = useState(item.serving_unit);
  const [form, setForm] = useState({
    quantity: String(item.quantity),
    calories: String(Math.round(item.calories)),
    protein_g: String(Math.round(item.protein_g)),
    carbs_g: String(Math.round(item.carbs_g)),
    fat_g: String(Math.round(item.fat_g)),
    fiber_g: String(Math.round(item.fiber_g ?? 0)),
    sugar_g: String(Math.round(item.sugar_g ?? 0)),
  });

  function startEdit() {
    setEditUnit(item.serving_unit);
    setForm({
      quantity: String(item.quantity),
      calories: String(Math.round(item.calories)),
      protein_g: String(Math.round(item.protein_g)),
      carbs_g: String(Math.round(item.carbs_g)),
      fat_g: String(Math.round(item.fat_g)),
      fiber_g: String(Math.round(item.fiber_g ?? 0)),
      sugar_g: String(Math.round(item.sugar_g ?? 0)),
    });
    setEditing(true);
  }

  function handleUnitChange(newUnit: string) {
    const currentQty = parseFloat(form.quantity);
    if (!isNaN(currentQty)) {
      setForm(f => ({ ...f, quantity: String(convertToServingUnit(currentQty, editUnit, newUnit)) }));
    }
    setEditUnit(newUnit);
  }

  function save() {
    const rawQty = parseFloat(form.quantity);
    const qty = editUnit !== item.serving_unit
      ? convertToServingUnit(rawQty, editUnit, item.serving_unit)
      : rawQty;
    const data: MealItemEdit = {};
    if (!isNaN(qty) && qty > 0 && qty !== item.quantity) data.quantity = qty;
    const macroFields: (keyof MealItemEdit)[] = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g'];
    for (const f of macroFields) {
      const n = parseFloat(form[f as keyof typeof form]);
      const current = Math.round((item as any)[f] ?? 0);
      if (!isNaN(n) && n !== current) (data as any)[f] = n;
    }
    if (Object.keys(data).length > 0) onEdit(data);
    setEditing(false);
  }

  const setF = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const [showIngredients, setShowIngredients] = useState(false);

  if (editing) {
    return (
      <div className="px-4 py-3 border-b border-gray-800/50 last:border-0 bg-gray-800/30 space-y-2">
        <p className="text-sm text-white truncate">{item.food_name}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 w-14 shrink-0">Quantity</span>
          <input type="number" value={form.quantity} onChange={setF('quantity')} autoFocus
            className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:border-indigo-500 outline-none" />
          {MASS_VOL_UNITS.includes(item.serving_unit) ? (
            <Select
              value={editUnit}
              onChange={e => handleUnitChange(e.target.value)}
              className="w-16 text-xs py-0.5"
              options={MASS_VOL_UNITS.map(u => ({ value: u, label: u }))}
            />
          ) : (
            <span className="text-xs text-gray-500">{item.serving_unit}</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            ['calories', 'Calories'], ['protein_g', 'Protein (g)'], ['carbs_g', 'Carbs (g)'],
            ['fat_g', 'Fat (g)'], ['fiber_g', 'Fiber (g)'], ['sugar_g', 'Sugar (g)'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label className="text-[10px] text-gray-500 block mb-0.5">{label}</label>
              <input type="number" value={form[key]} onChange={setF(key)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:border-indigo-500 outline-none" />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-600">Editing this only changes this logged entry — the food in your library is untouched.</p>
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="secondary" onClick={() => setEditing(false)} className="flex-1">Cancel</Button>
          <Button size="sm" onClick={save} className="flex-1">Save</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-800/50 last:border-0">
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white truncate">{item.food_name}</p>
          <p className="text-xs text-gray-500">{item.quantity} {item.serving_unit} · {Math.round(item.calories)} kcal</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {confirmDelete ? (
            <>
              <button onClick={() => { onDelete(); setConfirmDelete(false); }}
                className="text-[11px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 hover:bg-red-900 transition-colors">
                Del
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="text-[11px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 hover:text-white transition-colors">
                No
              </button>
            </>
          ) : (
            <>
              <div className="text-right text-xs text-gray-500">
                <span>P{Math.round(item.protein_g)}</span>
                {' · '}
                <span>C{Math.round(item.carbs_g)}</span>
                {' · '}
                <span>F{Math.round(item.fat_g)}</span>
              </div>
              {item.brand === 'Quick Entry' && (
                <button onClick={() => setShowIngredients(s => !s)}
                  className="p-1 text-gray-600 hover:text-indigo-400 transition-colors"
                  title={showIngredients ? 'Hide ingredients' : 'Show ingredients'}>
                  {showIngredients ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              )}
              <button onClick={startEdit} className="p-1 text-gray-600 hover:text-indigo-400 transition-colors">
                <Pencil size={13} />
              </button>
              <button onClick={() => setConfirmDelete(true)} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>
      {showIngredients && (
        <IngredientBreakdown
          foodId={item.food_id}
          onMacrosChanged={(macros) => onEdit(macros)}
        />
      )}
    </div>
  );
}

// ─── AddMealModal ─────────────────────────────────────────────────────────────

function AddMealModal({ open, onClose, onCreate, loading }: {
  open: boolean; onClose: () => void;
  onCreate: (type: MealType) => void; loading: boolean;
}) {
  const [type, setType] = useState<MealType>(getDefaultMealType);
  return (
    <Modal open={open} onClose={onClose} title="Add Meal" size="sm">
      <div className="space-y-4">
        <Select label="Meal type" value={type} onChange={e => setType(e.target.value as MealType)} options={MEAL_TYPES} />
        <Button onClick={() => onCreate(type)} disabled={loading} className="w-full">
          {loading ? 'Adding…' : 'Add Meal'}
        </Button>
      </div>
    </Modal>
  );
}

// ─── Recent item type (mirrors Dashboard's) ───────────────────────────────────

interface RecentItem {
  item_id: number;
  food_id: number;
  food_name: string;
  quantity: number;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  meal_type: string;
  meal_date: string;
  logged_by_user_id: number;
  logged_by_name: string;
  is_mine: boolean;
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner',
  snack: 'Snack', pre_workout: 'Pre-workout', post_workout: 'Post-workout',
};

// ─── AddFoodModal ─────────────────────────────────────────────────────────────

function AddFoodModal({ open, mealId, userId, onClose, onAdded }: {
  open: boolean; mealId: number; userId: number; onClose: () => void; onAdded: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [showCreateFood, setShowCreateFood] = useState(false);
  const [createFoodTarget, setCreateFoodTarget] = useState<'main' | 'ingredient'>('main');
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [showRecent, setShowRecent] = useState(false);

  // AI parse state
  const [showAiParse, setShowAiParse] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiItems, setAiItems] = useState<AiParsedItem[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Quick log state
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [quickTab, setQuickTab] = useState<'macros' | 'ingredients'>('macros');
  const [quickMacros, setQuickMacros] = useState({ name: '', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 });
  const [ingredSearch, setIngredSearch] = useState('');
  const [ingredList, setIngredList] = useState<{ food: Food; quantity: number; unit: string }[]>([]);
  const [ingredMealName, setIngredMealName] = useState('');

  const { data: foods = [] } = useQuery({
    queryKey: ['foods', search],
    queryFn: () => api.get<Food[]>(`/foods?search=${encodeURIComponent(search)}&limit=25`),
    enabled: search.length >= 1,
  });

  const { data: recentItems = [] } = useQuery({
    queryKey: ['recent-items', userId],
    queryFn: () => api.get<RecentItem[]>(`/meals/user/${userId}/recent-items?limit=30`),
    staleTime: 60_000,
  });

  const addRecentItem = useMutation({
    mutationFn: (item: RecentItem) =>
      api.post(`/meals/${mealId}/items`, { food_id: item.food_id, quantity: item.quantity }),
    onSuccess: (_, item) => {
      onAdded();
      setLastAdded(item.food_name);
    },
  });

  const { data: ingredFoods = [] } = useQuery({
    queryKey: ['foods', ingredSearch],
    queryFn: () => api.get<Food[]>(`/foods?search=${encodeURIComponent(ingredSearch)}&limit=20`),
    enabled: ingredSearch.length >= 1 && showQuickLog && quickTab === 'ingredients',
  });

  const addItem = useMutation({
    mutationFn: () => api.post(`/meals/${mealId}/items`, {
      food_id: selected!.id,
      quantity: convertToServingUnit(parseFloat(quantity), unit || selected!.serving_unit, selected!.serving_unit),
    }),
    onSuccess: () => {
      onAdded();
      setLastAdded(selected!.name);
      setSelected(null);
      setQuantity('');
      setUnit('');
      setSearch('');
    },
  });

  const createFood = useMutation({
    mutationFn: (data: Partial<Food>) => api.post<Food>('/foods', data),
    onSuccess: (food) => {
      qc.invalidateQueries({ queryKey: ['foods'] });
      if (createFoodTarget === 'ingredient') {
        setIngredList(l => [...l, { food, quantity: food.serving_size, unit: food.serving_unit }]);
        setIngredSearch('');
      } else {
        setSelected(food);
        setQuantity(String(food.serving_size));
      }
      setShowCreateFood(false);
    },
  });

  const quickLogMacros = useMutation({
    mutationFn: async () => {
      const food = await api.post<Food>('/foods', {
        name: quickMacros.name.trim() || 'Quick entry',
        brand: 'Quick Entry',
        serving_size: 1, serving_unit: 'serving',
        calories: quickMacros.calories, protein_g: quickMacros.protein_g,
        carbs_g: quickMacros.carbs_g, fat_g: quickMacros.fat_g,
        fiber_g: quickMacros.fiber_g, sugar_g: quickMacros.sugar_g,
      });
      await api.post(`/meals/${mealId}/items`, { food_id: food.id, quantity: 1 });
    },
    onSuccess: () => {
      onAdded();
      setLastAdded(quickMacros.name.trim() || 'Quick entry');
      setShowQuickLog(false);
      setQuickMacros({ name: '', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 });
    },
  });

  const quickLogIngredients = useMutation({
    mutationFn: async () => {
      const name = ingredMealName.trim() || 'Mixed Ingredients';
      const totals = ingredList.reduce((acc, { food, quantity: qty, unit: u }) => {
        const scale = convertToServingUnit(qty, u || food.serving_unit, food.serving_unit) / food.serving_size;
        return {
          calories: acc.calories + food.calories * scale,
          protein_g: acc.protein_g + food.protein_g * scale,
          carbs_g: acc.carbs_g + food.carbs_g * scale,
          fat_g: acc.fat_g + food.fat_g * scale,
          fiber_g: acc.fiber_g + (food.fiber_g || 0) * scale,
          sugar_g: acc.sugar_g + (food.sugar_g || 0) * scale,
        };
      }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 });
      const food = await api.post<Food>('/foods', {
        name, brand: 'Quick Entry', serving_size: 1, serving_unit: 'serving',
        calories: Math.round(totals.calories), protein_g: Math.round(totals.protein_g),
        carbs_g: Math.round(totals.carbs_g), fat_g: Math.round(totals.fat_g),
        fiber_g: Math.round(totals.fiber_g), sugar_g: Math.round(totals.sugar_g),
      });
      await api.post(`/meals/${mealId}/items`, { food_id: food.id, quantity: 1 });
      // Store each ingredient so breakdown can be viewed and edited later
      for (const item of ingredList) {
        const qty = convertToServingUnit(item.quantity, item.unit || item.food.serving_unit, item.food.serving_unit);
        await api.post(`/foods/${food.id}/ingredients`, { ingredient_food_id: item.food.id, quantity: qty });
      }
    },
    onSuccess: () => {
      onAdded();
      setLastAdded(ingredMealName.trim() || 'Mixed Ingredients');
      setIngredList([]); setIngredSearch(''); setIngredMealName('');
      setShowQuickLog(false);
    },
  });

  const parseFood = useMutation({
    mutationFn: (text: string) => api.post<{ items: Omit<AiParsedItem, '_qty' | '_include'>[] }>('/ai/parse-food', { text }),
    onSuccess: (data) => {
      setAiItems(data.items.map(item => ({ ...item, _qty: String(item.quantity), _include: true })));
      setAiError(null);
    },
    onError: (e: Error) => setAiError(e.message),
  });

  const logAiItems = useMutation({
    mutationFn: async (items: AiParsedItem[]) => {
      for (const item of items.filter(i => i._include)) {
        const qty = parseFloat(item._qty) || item.quantity;

        // Try to reuse an existing library food by exact name match
        let food: Food | null = null;
        try {
          const results = await api.get<Food[]>(`/foods?search=${encodeURIComponent(item.name)}&limit=10`);
          food = results.find(f => f.name.toLowerCase() === item.name.toLowerCase()) ?? null;
        } catch { /* ignore search errors, fall through to create */ }

        if (!food) {
          food = await api.post<Food>('/foods', {
            name: item.name,
            brand: 'AI Parse',
            serving_size: item.serving_size,
            serving_unit: item.serving_unit,
            calories: item.calories,
            protein_g: item.protein_g,
            carbs_g: item.carbs_g,
            fat_g: item.fat_g,
            fiber_g: item.fiber_g ?? 0,
            sugar_g: item.sugar_g ?? 0,
            saturated_fat_g: item.saturated_fat_g ?? 0,
            sodium_mg: item.sodium_mg ?? 0,
            cholesterol_mg: item.cholesterol_mg ?? 0,
            potassium_mg: item.potassium_mg ?? 0,
            added_sugar_g: item.added_sugar_g ?? null,
          });
        }

        const totalInAiUnit = qty * item.serving_size;
        const finalQty = convertToServingUnit(totalInAiUnit, item.serving_unit, food.serving_unit);
        await api.post(`/meals/${mealId}/items`, { food_id: food.id, quantity: finalQty });
      }
    },
    onSuccess: () => {
      onAdded();
      const count = (aiItems ?? []).filter(i => i._include).length;
      setLastAdded(`${count} AI-parsed item${count !== 1 ? 's' : ''}`);
      setShowAiParse(false);
      setAiText('');
      setAiItems(null);
    },
  });

  const ingredTotals = ingredList.reduce((acc, { food, quantity: qty, unit: u }) => {
    const scale = convertToServingUnit(qty, u || food.serving_unit, food.serving_unit) / food.serving_size;
    return {
      calories: acc.calories + food.calories * scale,
      protein_g: acc.protein_g + food.protein_g * scale,
      carbs_g: acc.carbs_g + food.carbs_g * scale,
      fat_g: acc.fat_g + food.fat_g * scale,
      fiber_g: acc.fiber_g + (food.fiber_g || 0) * scale,
    };
  }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });

  const effectiveUnit = unit || (selected?.serving_unit ?? '');
  const convertedQty = selected && quantity
    ? convertToServingUnit(parseFloat(quantity), effectiveUnit, selected.serving_unit)
    : 0;
  const scale = selected && convertedQty > 0 ? convertedQty / selected.serving_size : 0;
  const preview = selected && scale > 0 ? {
    calories:  Math.round(selected.calories  * scale),
    protein_g: Math.round(selected.protein_g * scale),
    carbs_g:   Math.round(selected.carbs_g   * scale),
    fat_g:     Math.round(selected.fat_g     * scale),
    fiber_g:   Math.round((selected.fiber_g || 0) * scale),
  } : null;

  if (showCreateFood) {
    return (
      <Modal open={open} onClose={onClose} title="New Food" size="md">
        <QuickFoodForm
          initialName={createFoodTarget === 'ingredient' ? ingredSearch : search}
          onSave={(data) => createFood.mutate(data)}
          onCancel={() => setShowCreateFood(false)}
          loading={createFood.isPending}
        />
      </Modal>
    );
  }

  if (showRecent) {
    const todayStr = fmt(new Date());
    const yesterdayStr = fmt(new Date(Date.now() - 86400000));
    const dateLabel = (d: string) =>
      d === todayStr ? 'Today' : d === yesterdayStr ? 'Yesterday' : new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    return (
      <Modal open={open} onClose={onClose} title="Recent Foods" size="md">
        <div className="space-y-3">
          {lastAdded && (
            <div className="flex items-center gap-2 bg-indigo-950 border border-indigo-800 rounded-xl px-3 py-2">
              <Check size={13} className="text-indigo-400 shrink-0" />
              <span className="text-xs text-indigo-300 flex-1 truncate">Added: {lastAdded}</span>
              <button onClick={() => setLastAdded(null)} className="text-indigo-600 hover:text-indigo-400 text-xs">✕</button>
            </div>
          )}
          {recentItems.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No recent items yet — log some meals first.</p>
          ) : (
            <div className="space-y-1 max-h-[28rem] overflow-y-auto">
              {recentItems.map(item => (
                <button
                  key={item.item_id}
                  onClick={() => addRecentItem.mutate(item)}
                  disabled={addRecentItem.isPending}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-800 text-left transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{item.food_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-gray-500">
                        {item.quantity}{item.serving_unit} · {Math.round(item.calories)} kcal
                      </span>
                      <span className="text-[10px] text-gray-700">
                        {dateLabel(item.meal_date)} · {MEAL_LABELS[item.meal_type] ?? item.meal_type}
                      </span>
                      {!item.is_mine && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400 shrink-0">
                          via {item.logged_by_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-[11px] text-gray-600 text-right">
                    <div className="text-sky-400/70">{Math.round(item.protein_g)}P</div>
                    <div className="text-amber-400/70">{Math.round(item.carbs_g)}C</div>
                    <div className="text-orange-400/70">{Math.round(item.fat_g)}F</div>
                  </div>
                  <Plus size={14} className="text-gray-700 group-hover:text-indigo-400 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          )}
          <Button variant="secondary" onClick={() => setShowRecent(false)} className="w-full">
            Back to search
          </Button>
        </div>
      </Modal>
    );
  }

  if (showAiParse) {
    const includedItems = (aiItems ?? []).filter(i => i._include);
    const totals = includedItems.reduce((acc, item) => {
      const qty = parseFloat(item._qty) || item.quantity;
      const scale = (qty * item.serving_size) / item.serving_size;
      return {
        calories: acc.calories + item.calories * scale,
        protein_g: acc.protein_g + item.protein_g * scale,
        carbs_g: acc.carbs_g + item.carbs_g * scale,
        fat_g: acc.fat_g + item.fat_g * scale,
      };
    }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });

    return (
      <Modal open={open} onClose={onClose} title="AI Food Parser" size="md">
        <div className="space-y-4">
          {/* Input area */}
          {!aiItems && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">
                Describe what you ate in plain language. Be as specific as you like — quantities, brands, cooking method.
              </p>
              <textarea
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
                rows={4}
                placeholder="e.g. 2 scrambled eggs with a slice of whole wheat toast and a large coffee with whole milk"
                value={aiText}
                onChange={e => setAiText(e.target.value)}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && aiText.trim()) {
                    parseFood.mutate(aiText.trim());
                  }
                }}
              />
              {aiError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-xl px-3 py-2">
                  {aiError.includes('ANTHROPIC_API_KEY')
                    ? 'API key not set. Add ANTHROPIC_API_KEY to server/.env and restart the server.'
                    : aiError}
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => { setShowAiParse(false); setAiText(''); setAiError(null); }} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={() => parseFood.mutate(aiText.trim())}
                  disabled={!aiText.trim() || parseFood.isPending}
                  className="flex-1 bg-violet-600 hover:bg-violet-500"
                >
                  {parseFood.isPending ? (
                    <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full mr-1.5" />Parsing…</>
                  ) : (
                    <><Sparkles size={14} /> Parse</>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-gray-600 text-center">Tip: ⌘↵ / Ctrl↵ to submit</p>
            </div>
          )}

          {/* Parsed results */}
          {aiItems && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">Review and adjust quantities, then log.</p>
                <button onClick={() => { setAiItems(null); setAiText(''); }} className="text-xs text-gray-500 hover:text-white">← Edit</button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {aiItems.map((item, i) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors ${item._include ? 'border-gray-700 bg-gray-800/50' : 'border-gray-800 bg-gray-900/50 opacity-50'}`}>
                    <input
                      type="checkbox"
                      checked={item._include}
                      onChange={e => setAiItems(prev => prev!.map((it, j) => j === i ? { ...it, _include: e.target.checked } : it))}
                      className="accent-violet-500 w-3.5 h-3.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{item.name}</p>
                      <p className="text-[11px] text-gray-500">
                        {Math.round(item.calories * (parseFloat(item._qty) || item.quantity))} kcal · {item.protein_g * (parseFloat(item._qty) || item.quantity)}P · {item.carbs_g * (parseFloat(item._qty) || item.quantity)}C · {item.fat_g * (parseFloat(item._qty) || item.quantity)}F
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={item._qty}
                        onChange={e => setAiItems(prev => prev!.map((it, j) => j === i ? { ...it, _qty: e.target.value } : it))}
                        className="w-14 bg-gray-700 border border-gray-600 rounded-lg px-1.5 py-0.5 text-xs text-white text-right focus:outline-none focus:border-indigo-500"
                      />
                      <span className="text-[11px] text-gray-500 w-8 truncate">{item.serving_unit}</span>
                    </div>
                  </div>
                ))}
              </div>

              {includedItems.length > 0 && (
                <div className="flex items-center justify-between text-[11px] text-gray-400 px-1">
                  <span>{includedItems.length} item{includedItems.length !== 1 ? 's' : ''}</span>
                  <span>{Math.round(totals.calories)} kcal · {totals.protein_g.toFixed(1)}P · {totals.carbs_g.toFixed(1)}C · {totals.fat_g.toFixed(1)}F</span>
                </div>
              )}

              <Button
                onClick={() => logAiItems.mutate(aiItems)}
                disabled={includedItems.length === 0 || logAiItems.isPending}
                className="w-full bg-violet-600 hover:bg-violet-500"
                size="lg"
              >
                {logAiItems.isPending ? (
                  <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full mr-1.5" />Logging…</>
                ) : (
                  <><Check size={15} /> Log {includedItems.length} item{includedItems.length !== 1 ? 's' : ''}</>
                )}
              </Button>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  if (showQuickLog) {
    const setQM = (k: keyof typeof quickMacros) => (e: ChangeEvent<HTMLInputElement>) =>
      setQuickMacros(f => ({ ...f, [k]: e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }));

    return (
      <Modal open={open} onClose={onClose} title="Quick Log" size="md">
        <div className="space-y-4">
          <div className="flex gap-1 bg-gray-800 rounded-xl p-1">
            {(['macros', 'ingredients'] as const).map(tab => (
              <button key={tab} onClick={() => setQuickTab(tab)}
                className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  quickTab === tab ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                }`}>
                {tab === 'macros' ? 'By macros' : 'By ingredients'}
              </button>
            ))}
          </div>

          {quickTab === 'macros' && (
            <div className="space-y-3">
              <Input label="Name (optional)" value={quickMacros.name} onChange={setQM('name')} placeholder="e.g. Pasta salad, chicken burrito…" autoFocus />
              <div className="grid grid-cols-2 gap-2">
                {(() => {
                  const logOnEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && quickMacros.calories > 0 && !quickLogMacros.isPending) quickLogMacros.mutate(); };
                  return (<>
                    <Input label="Calories *" type="number" value={quickMacros.calories || ''} onChange={setQM('calories')} onKeyDown={logOnEnter} />
                    <Input label="Protein (g)" type="number" value={quickMacros.protein_g || ''} onChange={setQM('protein_g')} onKeyDown={logOnEnter} />
                    <Input label="Carbs (g)" type="number" value={quickMacros.carbs_g || ''} onChange={setQM('carbs_g')} onKeyDown={logOnEnter} />
                    <Input label="Fat (g)" type="number" value={quickMacros.fat_g || ''} onChange={setQM('fat_g')} onKeyDown={logOnEnter} />
                    <Input label="Fiber (g)" type="number" value={quickMacros.fiber_g || ''} onChange={setQM('fiber_g')} onKeyDown={logOnEnter} />
                    <Input label="Sugar (g)" type="number" value={quickMacros.sugar_g || ''} onChange={setQM('sugar_g')} onKeyDown={logOnEnter} />
                  </>);
                })()}
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="secondary" onClick={() => setShowQuickLog(false)} className="flex-1">Back</Button>
                <Button onClick={() => quickLogMacros.mutate()}
                  disabled={quickMacros.calories <= 0 || quickLogMacros.isPending} className="flex-1">
                  {quickLogMacros.isPending ? 'Logging…' : 'Log It'}
                </Button>
              </div>
            </div>
          )}

          {quickTab === 'ingredients' && (
            <div className="space-y-3">
              <Input label="Meal name (optional)" value={ingredMealName}
                onChange={e => setIngredMealName(e.target.value)}
                placeholder="e.g. Oatmeal with berries, veggie bowl…" />
              <Input label="Add ingredient" value={ingredSearch}
                onChange={e => setIngredSearch(e.target.value)}
                placeholder="Search for an ingredient…" autoFocus />
              {ingredSearch.length >= 1 && ingredFoods.length > 0 && (
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {ingredFoods.map(food => (
                    <button key={food.id}
                      onClick={() => {
                        if (!ingredList.find(i => i.food.id === food.id))
                          setIngredList(l => [...l, { food, quantity: food.serving_size, unit: food.serving_unit }]);
                        setIngredSearch('');
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-800 text-left transition-colors">
                      <span className="text-sm text-white">{food.name}</span>
                      <span className="text-xs text-gray-500 shrink-0 ml-2">{food.calories} kcal/{food.serving_size}{food.serving_unit}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => { setCreateFoodTarget('ingredient'); setShowCreateFood(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-gray-700 hover:border-indigo-500 text-gray-500 hover:text-indigo-400 text-sm transition-colors"
                  >
                    <Plus size={13} /> Create "{ingredSearch}"
                  </button>
                </div>
              )}
              {ingredSearch.length >= 1 && ingredFoods.length === 0 && (
                <div className="text-center py-3">
                  <p className="text-sm text-gray-500 mb-2">No results for "{ingredSearch}"</p>
                  <Button size="sm" variant="secondary" onClick={() => { setCreateFoodTarget('ingredient'); setShowCreateFood(true); }}>
                    <Plus size={13} /> Create "{ingredSearch}"
                  </Button>
                </div>
              )}
              {ingredList.length > 0 && (
                <div className="space-y-2">
                  {ingredList.map((item, i) => (
                    <div key={item.food.id} className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-xl">
                      <span className="text-sm text-white flex-1 truncate">{item.food.name}</span>
                      <input type="number" value={item.quantity}
                        onChange={e => setIngredList(l => l.map((it, j) => j === i ? { ...it, quantity: parseFloat(e.target.value) || 0 } : it))}
                        className="w-16 text-sm text-right bg-gray-700 rounded-lg px-2 py-1 text-white border-0 outline-none" />
                      <select
                        value={item.unit}
                        onChange={e => setIngredList(l => l.map((it, j) => j === i ? { ...it, unit: e.target.value } : it))}
                        className="text-xs bg-gray-700 rounded px-1 py-1 text-gray-300 border-0 min-w-[52px]"
                      >
                        {(MASS_VOL_UNITS.includes(item.food.serving_unit) ? MASS_VOL_UNITS : [item.food.serving_unit]).map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                      <button onClick={() => setIngredList(l => l.filter((_, j) => j !== i))}
                        className="text-gray-600 hover:text-red-400 text-xs ml-1">✕</button>
                    </div>
                  ))}
                  <div className="bg-gray-800 rounded-xl px-3 py-2 flex gap-3 text-sm flex-wrap">
                    <span className="text-white font-semibold">{Math.round(ingredTotals.calories)} kcal</span>
                    <span className="text-sky-400">{Math.round(ingredTotals.protein_g)}g P</span>
                    <span className="text-amber-400">{Math.round(ingredTotals.carbs_g)}g C</span>
                    <span className="text-orange-400">{Math.round(ingredTotals.fat_g)}g Fat</span>
                    <span className="text-emerald-400">{Math.round(ingredTotals.fiber_g)}g Fib</span>
                  </div>
                  {ingredMealName.trim() && (
                    <p className="text-[11px] text-indigo-400">Will log as one item: "{ingredMealName.trim()}"</p>
                  )}
                  <Button onClick={() => quickLogIngredients.mutate()}
                    disabled={quickLogIngredients.isPending} className="w-full">
                    {quickLogIngredients.isPending ? 'Logging…' : ingredMealName.trim() ? `Log as "${ingredMealName.trim()}"` : `Log ${ingredList.length} ingredients`}
                  </Button>
                </div>
              )}
              <Button variant="secondary" onClick={() => setShowQuickLog(false)} className="w-full">Back</Button>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Food to Meal" size="md">
      <div className="space-y-4">
        {/* Restaurant quick-filter chips */}
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-0.5">
          {RESTAURANT_FILTERS.map(f => (
            <button
              key={f.label}
              onClick={() => { setSearch(f.q); setSelected(null); setLastAdded(null); }}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                search === f.q
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {lastAdded && (
          <div className="flex items-center gap-2 bg-emerald-950 border border-emerald-800 rounded-xl px-3 py-2">
            <Check size={13} className="text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-300">Added <span className="font-medium">{lastAdded}</span> — search for more</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => { setShowRecent(true); setLastAdded(null); }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-gray-700 hover:border-indigo-500 text-gray-500 hover:text-indigo-400 text-xs font-medium transition-colors">
            <Clock size={12} /> Recent
            {recentItems.length > 0 && <span className="ml-0.5 text-[10px] text-gray-600">({recentItems.length})</span>}
          </button>
          <button onClick={() => { setShowQuickLog(true); setLastAdded(null); }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-gray-700 hover:border-indigo-500 text-gray-500 hover:text-indigo-400 text-xs font-medium transition-colors">
            <Zap size={12} /> Quick log
          </button>
          <button onClick={() => { setShowAiParse(true); setLastAdded(null); setAiItems(null); setAiText(''); setAiError(null); }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-violet-900/60 hover:border-violet-500 text-violet-500/70 hover:text-violet-400 text-xs font-medium transition-colors">
            <Sparkles size={12} /> AI
          </button>
        </div>

        <Input
          label="Search food"
          placeholder="e.g. chicken breast, oats, chobani…"
          value={search}
          onChange={e => { setSearch(e.target.value); setSelected(null); setLastAdded(null); }}
          autoFocus
        />

        {search && foods.length === 0 && (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 mb-2">No results for "{search}"</p>
            <Button size="sm" variant="secondary" onClick={() => setShowCreateFood(true)}>
              <Plus size={13} /> Create "{search}"
            </Button>
          </div>
        )}

        {foods.length > 0 && !selected && (
          <div className="space-y-1 max-h-52 overflow-y-auto">
            {foods.map(food => (
              <button
                key={food.id}
                onClick={() => { setSelected(food); setQuantity(String(food.serving_size)); setUnit(food.serving_unit); setLastAdded(null); }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-800 text-left transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{food.name}</p>
                  <p className="text-xs text-gray-500 truncate">{food.brand ? `${food.brand} · ` : ''}per {food.serving_size} {food.serving_unit}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0 ml-2">{food.calories} kcal</span>
              </button>
            ))}
            <button
              onClick={() => setShowCreateFood(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-gray-700 hover:border-indigo-500 text-gray-500 hover:text-indigo-400 text-sm transition-colors"
            >
              <Plus size={13} /> Add new food…
            </button>
          </div>
        )}

        {selected && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{selected.name}</p>
                {selected.brand && <p className="text-xs text-gray-500">{selected.brand}</p>}
                <p className="text-xs text-gray-500">per {selected.serving_size} {selected.serving_unit}: {selected.calories} kcal</p>
              </div>
              <button onClick={() => { setSelected(null); setQuantity(''); }} className="text-xs text-gray-500 hover:text-white shrink-0 ml-2">
                change
              </button>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-gray-400">Quantity</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && quantity && parseFloat(quantity) > 0 && !addItem.isPending) addItem.mutate(); }}
                  autoFocus
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                />
                <select
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-xl px-2 text-sm text-white min-w-[72px] focus:border-indigo-500"
                >
                  {(MASS_VOL_UNITS.includes(selected.serving_unit) ? MASS_VOL_UNITS : [selected.serving_unit]).map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
            {preview && (
              <div className="bg-gray-800 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1.5">Macros for {quantity} {unit}</p>
                <div className="flex gap-3 text-sm flex-wrap">
                  <span className="text-white font-semibold">{preview.calories} kcal</span>
                  <span className="text-sky-400">{preview.protein_g}g P</span>
                  <span className="text-amber-400">{preview.carbs_g}g C</span>
                  <span className="text-orange-400">{preview.fat_g}g Fat</span>
                  {(preview.fiber_g ?? 0) > 0 && <span className="text-emerald-400">{preview.fiber_g}g Fib</span>}
                </div>
              </div>
            )}
            <Button
              onClick={() => addItem.mutate()}
              disabled={!quantity || parseFloat(quantity) <= 0 || addItem.isPending}
              className="w-full"
            >
              {addItem.isPending ? 'Adding…' : 'Add to Meal'}
            </Button>
          </div>
        )}

        {lastAdded && (
          <Button variant="secondary" onClick={onClose} className="w-full">
            Done
          </Button>
        )}
      </div>
    </Modal>
  );
}

// ─── QuickFoodForm ────────────────────────────────────────────────────────────

const UNIT_OPTIONS = [
  { value: 'g',       label: 'g (grams)' },
  { value: 'ml',      label: 'ml (millilitres)' },
  { value: 'oz',      label: 'oz (ounces)' },
  { value: 'cup',     label: 'cup' },
  { value: 'tbsp',    label: 'tbsp' },
  { value: 'tsp',     label: 'tsp' },
  { value: 'serving', label: 'serving' },
  { value: 'piece',   label: 'piece' },
  { value: 'slice',   label: 'slice' },
];

function QuickFoodForm({ initialName = '', onSave, onCancel, loading }: {
  initialName?: string; onSave: (data: Partial<Food>) => void; onCancel: () => void; loading: boolean;
}) {
  const [form, setForm] = useState<Partial<Food>>({
    name: initialName, serving_size: 100, serving_unit: 'g',
    calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0,
  });
  const setNum = (k: keyof Food) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: parseFloat(e.target.value) || 0 }));
  const setStr = (k: keyof Food) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-3">
      <Input label="Food name *" value={form.name} onChange={setStr('name')} placeholder="e.g. Greek Yogurt" autoFocus
        onKeyDown={e => { if (e.key === 'Enter' && form.name && !loading) onSave(form); }} />
      <Input label="Brand (optional)" value={form.brand ?? ''} onChange={setStr('brand')} placeholder="e.g. Chobani" />
      <div className="grid grid-cols-2 gap-2">
        <Input label="Serving size" type="number" value={form.serving_size} onChange={setNum('serving_size')} />
        <Select label="Unit" value={form.serving_unit ?? 'g'} onChange={setStr('serving_unit')} options={UNIT_OPTIONS} />
      </div>
      <p className="text-xs text-gray-500">Macros per serving above:</p>
      <div className="grid grid-cols-3 gap-2">
        <Input label="Calories" type="number" value={form.calories} onChange={setNum('calories')} />
        <Input label="Protein (g)" type="number" value={form.protein_g} onChange={setNum('protein_g')} />
        <Input label="Carbs (g)" type="number" value={form.carbs_g} onChange={setNum('carbs_g')} />
        <Input label="Fat (g)" type="number" value={form.fat_g} onChange={setNum('fat_g')} />
        <Input label="Fiber (g)" type="number" value={form.fiber_g} onChange={setNum('fiber_g')} />
        <Input label="Sugar (g)" type="number" value={form.sugar_g} onChange={setNum('sugar_g')} />
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={!form.name || loading} className="flex-1">
          {loading ? 'Saving…' : 'Save Food'}
        </Button>
      </div>
    </div>
  );
}
