export type Match = {
    competitor1Id: string, competitor2Id: string
};
export type Round = {
    roundNumber: number, 
    matches: Match[]
};
export const generateSchedule = (competitorsIds: string[]) => {
    let competitorsIdsCopy: string[] = [...competitorsIds];
    const numOfCompetitors: number = competitorsIdsCopy.length
    const schedule: Round[] = [];
    
    for (let roundNumber = 1; roundNumber < numOfCompetitors; roundNumber++) {
        const round: Round = {roundNumber: roundNumber, matches: [] };
    
        for (let i = 0; i < numOfCompetitors / 2; i++) {
            const competitor1Id = competitorsIdsCopy[i];
            const competitor2Id = competitorsIdsCopy[numOfCompetitors - 1 - i];
    
            if (competitor1Id && competitor2Id) {
                round.matches.push({
                    competitor1Id: competitor1Id,
                    competitor2Id: competitor2Id
                });
            }
        }
  
        schedule.push(round);
        
        // Rotate the teams while keeping the first team fixed (cyclically)
        const last: string | undefined = competitorsIdsCopy.pop();
        if (last !== undefined) competitorsIdsCopy.splice(1, 0, last);
    }
  
    return schedule;
}
  
