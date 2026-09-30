export type RankingTeam = {
  id: number;
  teamCode: string;
  displayName: string;
};

export type RankingActivity = {
  id: number;
  name: string;
};

export type RankingScore = {
  teamId: number;
  activityId: number;
  judgeId: number;
  score: number;
};

export type LeaderboardRow = {
  teamId: number;
  teamCode: string;
  teamName: string;
  overallTotal: number;
  activityWins: number;
  rank: number;
  tied: boolean;
};

export type LeaderboardResult = {
  rows: LeaderboardRow[];
  activityTotals: Record<number, Record<number, number>>;
  incompleteActivities: number[];
};

export function calculateLeaderboard(
  teams: RankingTeam[],
  activities: RankingActivity[],
  scores: RankingScore[]
): LeaderboardResult {
  const activityTotals: Record<number, Record<number, number>> = {};
  const judgeCounts: Record<number, Record<number, Set<number>>> = {};

  for (const activity of activities) {
    activityTotals[activity.id] = {};
    judgeCounts[activity.id] = {};
    for (const team of teams) {
      activityTotals[activity.id][team.id] = 0;
      judgeCounts[activity.id][team.id] = new Set<number>();
    }
  }

  for (const score of scores) {
    if (!(score.activityId in activityTotals)) {
      continue;
    }
    if (!(score.teamId in activityTotals[score.activityId])) {
      continue;
    }
    activityTotals[score.activityId][score.teamId] += score.score;
    judgeCounts[score.activityId][score.teamId].add(score.judgeId);
  }

  const incompleteActivities: number[] = [];
  for (const activity of activities) {
    const incomplete = teams.some((team) => judgeCounts[activity.id][team.id].size < 3);
    if (incomplete) {
      incompleteActivities.push(activity.id);
    }
  }

  const activityWinsByTeam: Record<number, number> = {};
  for (const team of teams) {
    activityWinsByTeam[team.id] = 0;
  }

  for (const activity of activities) {
    const totals = teams.map((team) => activityTotals[activity.id][team.id]);
    const maxTotal = Math.max(...totals);

    for (const team of teams) {
      if (activityTotals[activity.id][team.id] === maxTotal) {
        activityWinsByTeam[team.id] += 1;
      }
    }
  }

  const baseRows = teams.map((team) => {
    let overallTotal = 0;
    for (const activity of activities) {
      overallTotal += activityTotals[activity.id][team.id];
    }

    return {
      teamId: team.id,
      teamCode: team.teamCode,
      teamName: team.displayName,
      overallTotal,
      activityWins: activityWinsByTeam[team.id],
      rank: 0,
      tied: false,
    } as LeaderboardRow;
  });

  baseRows.sort((a, b) => {
    if (b.overallTotal !== a.overallTotal) {
      return b.overallTotal - a.overallTotal;
    }
    if (b.activityWins !== a.activityWins) {
      return b.activityWins - a.activityWins;
    }
    return a.teamName.localeCompare(b.teamName);
  });

  let currentRank = 1;
  for (let i = 0; i < baseRows.length; i += 1) {
    if (i === 0) {
      baseRows[i].rank = currentRank;
      continue;
    }

    const prev = baseRows[i - 1];
    const curr = baseRows[i];

    const tiedWithPrev = prev.overallTotal === curr.overallTotal && prev.activityWins === curr.activityWins;
    if (tiedWithPrev) {
      curr.rank = prev.rank;
      prev.tied = true;
      curr.tied = true;
    } else {
      currentRank = i + 1;
      curr.rank = currentRank;
    }
  }

  return {
    rows: baseRows,
    activityTotals,
    incompleteActivities,
  };
}
