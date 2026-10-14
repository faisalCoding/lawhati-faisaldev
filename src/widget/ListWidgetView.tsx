import { FlexWidget, ListWidget, SvgWidget, TextWidget } from 'react-native-android-widget';

import { iconSvg } from './icons';
import { WIDGET_ACTIONS, widgetLinks, type ListWidgetCard, type ListWidgetModel } from './model';
import { BoardBar, DARK, DueBadge, LIGHT, Message, TaskRow, type Palette } from './parts';

type OkModel = Extract<ListWidgetModel, { status: 'ok' }>;

function Pill({ uri, icon, label, palette }: { uri: string; icon: string; label: string; palette: Palette }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexGap: 5,
        backgroundColor: palette.surface,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <TextWidget text={label} style={{ fontSize: 12, fontWeight: 'bold', color: palette.title }} />
      <SvgWidget svg={iconSvg(icon, palette.title, 2.2)} style={{ width: 14, height: 14 }} />
    </FlexWidget>
  );
}

/** One card of the list: folded to its title, or unfolded to its tasks when tapped. */
function CardItem({
  model,
  card,
  expanded,
  palette,
  dark,
}: {
  model: OkModel;
  card: ListWidgetCard;
  expanded: boolean;
  palette: Palette;
  dark: boolean;
}) {
  const done = card.tasks.filter((t) => t.done).length;
  return (
    <FlexWidget style={{ width: 'match_parent', paddingHorizontal: 10, paddingTop: 8 }}>
      <FlexWidget
        style={{ width: 'match_parent', backgroundColor: palette.raised, borderRadius: 14, flexDirection: 'column' }}
      >
        <FlexWidget
          clickAction={WIDGET_ACTIONS.expandCard}
          clickActionData={{ cardId: card.id }}
          accessibilityLabel={`${card.title}، ${expanded ? 'اضغط لطي المهام' : 'اضغط لعرض المهام'}`}
          style={{
            width: 'match_parent',
            flexDirection: 'row',
            alignItems: 'center',
            flexGap: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <SvgWidget
            svg={iconSvg(expanded ? 'chevron-up' : 'chevron-down', palette.subtle, 2.4)}
            style={{ width: 16, height: 16 }}
          />
          {card.tasks.length > 0 ? (
            <TextWidget
              text={`${done}/${card.tasks.length}`}
              style={{ fontSize: 12, color: done === card.tasks.length ? '#22A06B' : palette.subtle }}
            />
          ) : null}
          {card.due ? <DueBadge due={card.due} palette={palette} dark={dark} /> : null}
          <FlexWidget style={{ flex: 1 }}>
            <TextWidget
              text={card.title}
              maxLines={2}
              truncate="END"
              style={{ width: 'match_parent', fontSize: 15, fontWeight: 'bold', color: palette.title, textAlign: 'right' }}
            />
          </FlexWidget>
        </FlexWidget>

        {expanded ? (
          <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', paddingBottom: 10 }}>
            {card.tasks.length > 0 ? (
              card.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  boardId={model.boardId}
                  cardId={card.id}
                  task={task}
                  palette={palette}
                  inset={12}
                />
              ))
            ) : (
              <FlexWidget style={{ width: 'match_parent', paddingHorizontal: 12, paddingVertical: 4, alignItems: 'flex-end' }}>
                <TextWidget text="لا توجد مهام في هذه البطاقة" style={{ fontSize: 13, color: palette.subtle }} />
              </FlexWidget>
            )}
            <FlexWidget
              style={{
                width: 'match_parent',
                flexDirection: 'row',
                justifyContent: 'flex-end',
                flexGap: 8,
                paddingHorizontal: 12,
                paddingTop: 6,
              }}
            >
              <Pill uri={card.uri} icon="external" label="فتح البطاقة" palette={palette} />
              <Pill uri={widgetLinks.addTask(model.boardId, card.id)} icon="plus" label="إضافة مهمة" palette={palette} />
            </FlexWidget>
          </FlexWidget>
        ) : null}
      </FlexWidget>
    </FlexWidget>
  );
}

function ListView({
  model,
  palette,
  dark,
  widgetId,
}: {
  model: ListWidgetModel;
  palette: Palette;
  dark: boolean;
  widgetId: number;
}) {
  if (model.status !== 'ok') {
    const missing = model.status === 'missing';
    return (
      <Message
        palette={palette}
        title={missing ? 'لم تعد هذه القائمة موجودة' : 'لم تُختر قائمة بعد'}
        hint={`اضغط مطولًا على الودجت ثم «إعادة الضبط» لاختيار قائمة${missing ? ' أخرى' : ''}`}
      />
    );
  }

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: model.uri }}
      accessibilityLabel={`قائمة ${model.listTitle} في لوحة ${model.boardTitle}`}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: palette.surface,
        borderRadius: 24,
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <BoardBar
        color={model.boardColor}
        icon={model.boardIcon}
        title={`${model.listTitle} · ${model.cards.length}`}
        caption={model.boardTitle}
        changeUri={widgetLinks.changeList(widgetId)}
        changeLabel="تغيير القائمة"
      />
      <FlexWidget style={{ flex: 1, width: 'match_parent', paddingBottom: 8 }}>
        {model.cards.length > 0 ? (
          <ListWidget style={{ height: 'match_parent', width: 'match_parent' }}>
            {model.cards.map((card) => (
              <CardItem
                key={card.id}
                model={model}
                card={card}
                expanded={card.id === model.expandedCardId}
                palette={palette}
                dark={dark}
              />
            ))}
          </ListWidget>
        ) : (
          <FlexWidget
            style={{ height: 'match_parent', width: 'match_parent', alignItems: 'center', justifyContent: 'center' }}
          >
            <TextWidget text="لا توجد بطاقات في هذه القائمة" style={{ fontSize: 13, color: palette.subtle }} />
          </FlexWidget>
        )}
      </FlexWidget>
    </FlexWidget>
  );
}

/** Light and dark versions; the launcher picks one to match the system theme. */
export function renderListWidget(model: ListWidgetModel, widgetId: number) {
  return {
    light: <ListView model={model} palette={LIGHT} dark={false} widgetId={widgetId} />,
    dark: <ListView model={model} palette={DARK} dark widgetId={widgetId} />,
  };
}
